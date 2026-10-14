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
  vote_solved: Object.freeze({ face: 'vmu.ballotbox', op: 'cast' }),
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
  'solved', 'prioritize', 'hire', 'fire',
])

// THE FRAMEWORK OWNS THE IDEA OF A PHASE, NOT THE WORDS. Round 409 added `heartbeat` here because the original has it
// - a no-progress prompt that REPLACES an ordinary round - and that was the framework learning an institution word.
// Round 413 removes it again: `heartbeat` is one of the phases the v5r pack declares, and the loop validates the
// UNION of this list and whatever the pack supplies. The framework list is what a turn can be by itself; anything
// further is vocabulary, and vocabulary belongs to the institution.
const PHASES = Object.freeze(['founding', 'normal', 'checkpoint', 'verify', 'verify-debate', 'meeting', 'resume'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
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
export function deliverViaSubagents(subagents, extract = null) {
  if (!subagents || typeof subagents.startContinuable !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the subagents seam cannot start a member turn',
      'inject { deliver } yourself, or give the loop a seam with startContinuable (docs/26 stage 3)')
  }
  return async ({ turn, text }) => {
    // ROUND 346: the spec carries the SAME three elements the original's wake carries - who, why, and what next -
    // because a host that only receives "here is some text" cannot supervise the turn it just started. Measured
    // against the original: its wake takes { to, why, next_step }, so the framework labels its own the same way.
    const spec = {
      label: 'vmu-turn-' + String(turn && turn.id ? turn.id : 'unknown'),
      to: turn && turn.member ? turn.member : null,
      why: turn && typeof turn.why === 'string' ? turn.why : null,
      next_step: turn && typeof turn.nextStep === 'string' ? turn.nextStep : null,
      request: { prompt: [{ type: 'text', text: String(text) }] },
    }
    const handle = await subagents.startContinuable(spec)
    if (typeof extract === 'function') {
      const got = extract(handle)
      if (typeof got === 'string') {
        return { reply: got, childId: childIdOf(handle), stopReason: null,
          attribution: 'extractor returned a bare string: no stopReason was read (docs/26 §3.22)' }
      }
      if (got && typeof got === 'object' && typeof got.reply === 'string') {
        return { reply: got.reply, childId: got.childId || childIdOf(handle), stopReason: got.stopReason || null, attribution: 'extractor' }
      }
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the extractor returned no reply text for this turn')
    }
    // ROUND 4 / F11 (Lead's authoritative host contract): the handle carries the LIFECYCLE fields too, and a turn that
    // cannot be attributed is reported as such rather than silently treated as an anonymous reply.
    const childId = childIdOf(handle)
    let stopReason = null
    if (handle && typeof handle.stopReason === 'string') stopReason = handle.stopReason
    else if (handle && typeof handle.reason === 'string') stopReason = handle.reason
    else if (handle && handle.result && typeof handle.result.then === 'function') {
      try { const res = await handle.result; if (res && typeof res.stopReason === 'string') stopReason = res.stopReason } catch { /* the run's own failure is named below */ }
    }
    const attribution = childId && stopReason
      ? 'childId+stopReason from the host handle'
      : (childId ? 'childId only: the host handle carried no stopReason (SubagentRun.result was unavailable)' : 'unavailable: the host handle carried no childId (docs/26 §3.22) - the turn is NOT attributed')
    if (handle && typeof handle.reply === 'string') return { reply: handle.reply, childId, stopReason, attribution }
    if (handle && typeof handle.text === 'string') return { reply: handle.text, childId, stopReason, attribution }
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
  let lastAttribution = { childId: null, stopReason: null, attribution: 'no turn has been delivered yet' }
  let seq = 0

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
    return { ok: true, text: (noticeText ? noticeText + "\n" : "") + out.text, sources: out.sources || [], truncation: out.truncation || null }
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
      lastAttribution = { childId: null, stopReason: null, attribution: 'the delivery adapter returned a bare string: no childId/stopReason (docs/26 §3.22)' }
      return delivered
    }
    const reply = delivered && typeof delivered.reply === 'string' ? delivered.reply : null
    lastAttribution = {
      childId: (delivered && delivered.childId) || null,
      stopReason: (delivered && delivered.stopReason) || null,
      attribution: (delivered && delivered.attribution) || 'the delivery adapter returned an envelope without an attribution note',
    }
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
    if (unknown.length) {
      fail('VMU_TURN_UNKNOWN_FIELD', 'unknown reply field(s): ' + unknown.join(', ') + ' - refusing rather than guessing what was meant',
        'known fields: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    counts.parsed += 1
    return { ok: true, reply: obj, fields: Object.keys(obj) }
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

  const apply = async (reply, faceMap = null) => {
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
      const res = await fn(d.payload, { field: d.field, face: d.face, op: d.op })
      counts.dispatched += 1
      executed.push({ field: d.field, face: d.face, op: d.op, result: res })
    }
    // ROUND 394: the remaining recorded fields used to be RECOGNISED AND THEN DISCARDED - a model that wrote prioritize,
    // hire or fire had its payload vanish with no trace, which is the silent-failure class this repository refuses.
    // Each one is now kept on the turn state under its own name and reported in the receipt, so the framework can read
    // it and a consumer can see that it arrived. No face is invented for them: the members service is not even present
    // in a default kernel, and sending a payload to an operation that does not exist would be worse than keeping it.
    for (const field of RECORDED_FIELDS) {
      if (r[field] === undefined || r[field] === null) continue
      if (bookkeeping.some((b) => b.field === field)) continue
      context.set(field, r[field])
      bookkeeping.push({ field, kept: true })
    }
    if (bookkeeping.length) counts.bookkept = (counts.bookkept || 0) + bookkeeping.length
    return { ok: true, executed, skipped, planned: dispatches.length, bookkeeping }
  }

  /** One full turn, in order. Returns the turn receipt rather than making the caller re-implement the sequence. */
  const run = async (spec) => {
    const { turn } = open(spec)
    const asm = await assemble(turn)
    const raw = await deliverTurn(turn, asm.text)
    const parsed = parse(raw)
    // ROUND 496: `turn/reply-parsed` was frozen with a default policy and NOTHING emitted it, so middleware could not see
    // a parsed reply. Emitted BEFORE dispatch, which is the only point where inspecting it can still change the outcome.
    if (bus && typeof bus.emit === 'function') {
      const seen = await bus.emit('turn/reply-parsed', { turn: turn.id, member: turn.member, phase: turn.phase, fields: parsed.fields, reply: parsed.reply }, { member: turn.member, role: turn.role, phase: turn.phase })
      if (seen && seen.ok === false) fail((seen.refused && seen.refused.code) || 'VMU_MIDDLEWARE_FAILED', (seen.refused && seen.refused.message) || 'a middleware refused turn/reply-parsed', (seen.refused && seen.refused.hint) || null)
    }
    const out = await apply(parsed.reply)
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
    return { ok: true, turn, assembled: { chars: asm.text.length, sources: asm.sources.length }, fields: parsed.fields, refused, attribution: Object.assign({}, lastAttribution), ...out }
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
   * is no unlimited default), and a failing round STOPS the run and reports its number with the receipts so far -
   * a half-finished run is reported as half-finished, never as complete.
   */
  const drive = async ({ members = [], rounds = 1, phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    const n = Number(rounds)
    if (!Number.isInteger(n) || n < 1) {
      fail('VMU_INVALID_ARGUMENT', 'rounds must be a positive integer: the bound is stated, never assumed',
        'pass { rounds: N } (docs/26 section 3.2 invariant 2)')
    }
    const receipts = []
    for (let i = 1; i <= n; i += 1) {
      const spec = nextTurn({ members, phase, why, nextStep, role })
      if (!spec) return { ok: true, receipts, stopped: 'no-members', roundsRun: receipts.length }
      try {
        const r = await run({ ...spec, round: i })
        receipts.push({ round: i, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, turn: r.turn.id })
      } catch (e) {
        counts.refused += 0
        return { ok: false, round: i, code: e && e.code, message: String((e && e.message) || e), receipts, roundsRun: receipts.length }
      }
    }
    return { ok: true, receipts, roundsRun: receipts.length }
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
      return { ok: true, receipt: { round: r.turn.round, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, turn: r.turn.id } }
    } catch (e) {
      return { ok: false, code: e && e.code, message: String((e && e.message) || e), receipt: null }
    }
  }

  return {
    open, assemble, deliver: deliverTurn, parse, plan, apply, run, nextTurn, drive, step,
    // ROUND 4 / F9+F10: the ongoing-command verbs, plus the observable state behind them.
    sendToMember, interruptMember,
    attribution: () => Object.assign({}, lastAttribution),
    seams: () => ({ deliver: typeof deliver === 'function', sendMessage: typeof sendMessage === 'function', interrupt: typeof interrupt === 'function' }),
    /**
     * ROUND 384 - a ONE-SHOT notice for a member (docs/26 section 3.25). Queued here, drained by the next assembly
     * addressed to them, so it is announced exactly once: not repeated every round and never dropped. The charter
     * carries the wording of such a line; this queue carries the timing.
     */
    notify: (memberId, line) => queueNotice(memberId, line),
    /** Drain a member queued notices. The assembly calls this, which is what makes the announcement one-shot. */
    takeNotices: (memberId) => drainNotices(memberId),
    status: () => ({ apiVersion, turns: turns.size, fields: known.length, owners, policy: POLICY, woken: Object.fromEntries(woken), counts: { ...counts }, lastRefusal: { ...lastRefusal } }),
  }
}

export default createTurnOrchestrator
