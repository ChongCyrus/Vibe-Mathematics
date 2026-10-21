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
  meeting_hand: Object.freeze({ face: 'vmu.meetings', op: 'queue' }),
  meeting_invite: Object.freeze({ face: 'vmu.meetings', op: 'attend' }),
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
export function closureVoteOf({ votes = new Map(), roster = [], may = null, permission = 'vote' } = {}) {
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
  return {
    window: 'round',
    cast,
    for: forIt,
    against,
    missing,
    eligible: enfranchised,
    permission,
    reason: cast
      ? 'every enfranchised member judged the question solved'
      : (enfranchised.length === 0
        ? 'no member holds the closure-vote permission, so unanimity is unreachable - seat members with vibe_vmu_control { action: "hire", member_id, slot, institution } using a slot whose permissions include this one (the v5r pack grants it to `member` but NOT to `chair` or `temp`), then drive a turn; a deployment may rename the permission with vmu.turn.closureVotePermission. This reading appeared in a real run BEFORE any member was seated, which is why it names the PERMISSION rather than saying the roster is empty.'
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
  noticeSource = null } = {}) {
  const owners = resolveOwners(bindings)
  const known = Object.keys(owners)
  // ROUND 347: the wakeup POLICY (docs/26 section 3.2). The original preset recorded only WHO should be woken and
  // left WHEN and WITH WHICH PROMPT to its host - which is why only that host could run an institute. The policy is
  // a declared setting here, so the framework drives its own rounds and a host may still override the choice.
  const POLICY = ['round-robin', 'least-recent'].includes(wakeupPolicy) ? wakeupPolicy : 'round-robin'
  const woken = new Map()   // member -> how often this loop has opened a turn for it
  let cursor = 0            // round-robin position, so cycling is positional rather than count-based
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

  const fail = (code, message, hint) => { counts.refused += 1; lastRefusal.code = code; lastRefusal.message = message; throw refuse(code, message, hint) }

  /** ① open a turn: who, which round, which phase, which task. */
  const open = ({ member, role = null, roleLabel = null, phase, task = null, why = null, nextStep = null, roster = null, quorum = null, statusBlock = null, facts = null, meetingState = null, formalStatus = null, round = 1 } = {}) => {
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
    const turn = { id: 't-' + seq, member, role, roleLabel, phase, task, why, nextStep, roster, quorum, statusBlock, facts, meetingState, formalStatus, round, at: clock() }
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
    const statusWithNotices = (noticeText ? [turn.statusBlock] : [turn.statusBlock, ...pendingNotices])
      .filter((l) => typeof l === "string" && l.trim() !== "").join("\n")
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
    const out = await prompt.assemble({ member: turn.member, role: turn.role, roleLabel, phase: turn.phase, task: turn.task, roster: turn.roster, quorum: turn.quorum, statusBlock: statusWithNotices === "" ? turn.statusBlock : statusWithNotices, round: turn.round, settings: turnSettings })
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
      fail(sawJsonish ? 'VMU_TURN_BAD_JSON' : 'VMU_TURN_NO_FENCE',
        'the reply carries no usable json object, so there is nothing to apply',
        'ask for exactly one fenced json object (docs/26 §3); a bare fence, a bare object and a prose-wrapped object are all accepted')
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
    return Object.keys(r).filter((k) => Object.prototype.hasOwnProperty.call(owners, k)).map((k) => ({
      field: k, face: owners[k].face, op: owners[k].op, payload: r[k],
    }))
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
    return { ok: true, member: id, solved: value }
  }

  const apply = async (reply, faceMap = null, memberId = null) => {
    const map = faceMap || faces
    const r = reply && typeof reply === 'object' ? reply : {}
    const bookkeeping = []
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
    return { ok: true, executed, skipped, planned: dispatches.length, bookkeeping }
  }

  /** One full turn, in order. Returns the turn receipt rather than making the caller re-implement the sequence. */
  // ★ PHASE 6 / K2: renamed from `run` to `runOne` so the public `run` can be the guarded wrapper below. The body is
  // untouched; what changed is only that it is no longer directly callable while another turn is in flight.
  const runFrom = async (turn, spec) => {
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
    let parsed
    try {
      parsed = parse(raw)
    } catch (e) {
      // ★ SLV DIAGNOSTIC: a refusal about the reply's SHAPE must carry the reply itself (bounded), so the next run can
      // answer "empty? prose? a tool object?" from the record instead of re-running to guess.
      if (e && typeof e === 'object') {
        const text = String(raw === undefined || raw === null ? '' : raw)
        e.replyText = text.slice(0, 2000)
        e.replyLength = text.length
        e.hadBrace = text.indexOf('{') !== -1
      }
      throw e
    }
    // consumed once: the next turn's reply belongs to whoever it answers
    const attributedTo = lastReplyForMember
    lastReplyForMember = null
    // ★ PHASE 7: "ignored" must be READABLE - one notice for this member's next prompt (red line 3: never silent).
    if (Array.isArray(parsed.ignoredFields) && parsed.ignoredFields.length) {
      queueNotice(turn.member, '【研究所提示】回执里出现未登记字段：' + parsed.ignoredFields.join(', ') + '（已按 ignore-named 忽略；回执顶层请只写登记字段）')
    }
    // ROUND 496: `turn/reply-parsed` was frozen with a default policy and NOTHING emitted it, so middleware could not see
    // a parsed reply. Emitted BEFORE dispatch, which is the only point where inspecting it can still change the outcome.
    if (bus && typeof bus.emit === 'function') {
      const seen = await bus.emit('turn/reply-parsed', { turn: turn.id, member: turn.member, phase: turn.phase, fields: parsed.fields, reply: parsed.reply }, { member: turn.member, role: turn.role, phase: turn.phase })
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
        const text = typeof raw === 'string' ? raw : JSON.stringify(parsed.reply)
        if (e && typeof e === 'object') {
          e.replyText = String(text).slice(0, 2000)
          e.replyLength = String(text).length
          e.hadBrace = String(text).indexOf('{') !== -1
          e.trackValue = parsed.reply && parsed.reply.progress && parsed.reply.progress.track !== undefined ? parsed.reply.progress.track : null
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
    return { ok: true, turn, assembled: { chars: asm.text.length, sources: asm.sources.length }, instructionDelivered: asm.instructionDelivered === true, fields: parsed.fields, ignoredFields: parsed.ignoredFields || [], refused, attribution: Object.assign({}, lastAttribution), ...out }
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
    const { turn } = open(spec)
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
  const nextTurn = ({ members = [], phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    const list = (Array.isArray(members) ? members : []).filter((m) => m && typeof m.id === 'string' && m.id.trim() !== '')
    if (list.length === 0) return null
    let pick = null
    if (POLICY === 'least-recent') {
      const min = Math.min(...list.map((m) => woken.get(m.id) || 0))
      pick = list.find((m) => (woken.get(m.id) || 0) === min)
    } else {
      pick = list[cursor % list.length]
      cursor += 1
    }
    return { member: pick.id, role: role || pick.role || null, phase, why, nextStep }
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
    const n = Number(rounds)
    if (!Number.isInteger(n) || n < 1) {
      fail('VMU_INVALID_ARGUMENT', 'rounds must be a positive integer: the bound is stated, never assumed',
        'pass { rounds: N } (docs/26 section 3.2 invariant 2)')
    }
    const receipts = []
    const failures = []
    const consecutive = new Map()
    for (let i = 1; i <= n; i += 1) {
      const spec = nextTurn({ members, phase, why, nextStep, role })
      // ★★ ROUND 45: AN EMPTY ROUND MUST SAY WHERE MEMBERS COME FROM. `no-members` is true, but on its own it leaves a
      // reader unable to act - the real machine called this face sixty-one times and learned nothing from it. The
      // hint names the two things that actually help: read the roster, and pass it (the tool face now infers it from
      // the roster too, so omitting it works; this hint is for the case where the roster itself is empty).
      if (!spec) return { ok: true, receipts, failures, stopped: 'no-members', roundsRun: receipts.filter((r) => !r.failed).length, roundsAttempted: receipts.length,
        next: { kind: 'roster', tool: 'vibe_vmu_control', hint: 'no member was passed AND the kernel roster holds no live member: read it with vibe_vmu_control { action: "roster" }, seat one with { action: "hire", member_id, slot } (the pack declares the slots), then retry. Passing an explicit `members` array also works.' } }
      try {
        const r = await run({ ...spec, round: i })
        // ★ ROUND 73: a caller-played turn ENDS the batch - the prompt goes back and the round resumes on the next call.
        if (r && r.awaiting) return { ok: true, awaiting: true, memberPrompt: r.memberPrompt || null, deliveryPath: r.deliveryPath || (r.attribution && r.attribution.deliveryPath) || null, receipts, failures, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length, round: i, member: spec.member }
        receipts.push({ round: i, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, turn: r.turn.id })
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
            receipts, failures, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length,
            hint: 'the SAME member failed ' + streak + ' rounds in a row; a batch is not stopped by one bad reply, but a member that cannot answer three times in a row is reported (docs/26 section 3.2)' }
        }
      }
    }
    return { ok: true, receipts, failures, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length }
  }

  /**
   * ⑧ step: EXACTLY ONE round, chosen by the policy - the shape a scheduler tick wants (docs/26 section 3.3). The
   * host owns WHEN (the clock is a seam by design: `vmu.schedule.timeSource` is tick-only), the policy owns WHO, and
   * the pipeline owns WHAT PROMPT. A round that fails is RETURNED rather than thrown, because a failed round is an
   * operational outcome; a malformed ARGUMENT still throws, because that is a programming error.
   */
  const step = async ({ members = [], phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    const spec = nextTurn({ members, phase, why, nextStep, role })
    if (!spec) return { ok: true, receipt: null, stopped: 'no-members' }
    try {
      const r = await run({ ...spec, round: turns.size + 1 })
      // ★★★ ROUND 73: a caller-played turn is a LEGAL outcome, not a receipt with empty fields. It is surfaced as such so
      // the caller knows to play the member turn and answer on the next call.
      // ★ ROUND 88: and it NAMES THE ROUTE that handed the prompt back, so "which delivery path ran" is read from the
      // receipt the agent actually sees rather than inferred from prose in a transcript.
      if (r && r.awaiting) return { ok: true, awaiting: true, memberPrompt: r.memberPrompt || null, deliveryPath: r.deliveryPath || (r.attribution && r.attribution.deliveryPath) || null, receipt: null, attribution: r.attribution || null }
      return { ok: true, receipt: { round: r.turn.round, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, turn: r.turn.id } }
    } catch (e) {
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
        ...(e && typeof e.replyText === 'string' ? { replyLength: e.replyLength, hadBrace: e.hadBrace, replyExcerpt: e.replyText.slice(0, 500), trackValue: e.trackValue } : {}) }
    }
  }

  return {
    open, assemble, deliver: deliverTurn, parse, plan, apply, run, nextTurn, drive, step,
    dispatch, whenIdle, dispatchStatus,
    // ★★★ ROUND 73: THE CALLER-PLAYED TURN. When the injected seam is `deliverByReturning`, the assembled prompt
    // travels back to the caller and the member's reply arrives through this verb. A seam without `supply` refuses by
    // name rather than dropping the reply, because silently discarding an answer is the one outcome this phase has
    // ruled out everywhere else.
    supplyMemberReply: (reply) => {
      if (!deliver || typeof deliver.supply !== 'function') {
        fail('VMU_ENGINE_UNAVAILABLE', 'this delivery seam does not accept a caller-supplied reply',
          'supplyMemberReply applies only to the deliverByReturning seam; a real delivery seam answers with the reply itself')
      }
      deliver.supply(reply)
      return { ok: true, supplied: true }
    },
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

export default createTurnOrchestrator








