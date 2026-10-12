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
})

export const FIELDS = Object.freeze(Object.keys(FIELD_OWNERS))

const PHASES = Object.freeze(['founding', 'normal', 'checkpoint', 'verify', 'verify-debate', 'meeting', 'resume'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** Extract the single fenced json block. Returns null when there is none (that is a DIFFERENT failure from bad JSON). */
export function extractFence(text) {
  const m = String(text === undefined || text === null ? '' : text).match(/```json\s*([\s\S]*?)```/)
  return m ? m[1] : null
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
      if (typeof got === 'string') return got
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the extractor returned no reply text for this turn')
    }
    if (handle && typeof handle.reply === 'string') return handle.reply
    if (handle && typeof handle.text === 'string') return handle.text
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host accepted the turn but handed back no reply',
      'give the loop an extractor, or deliver the reply through the loop as a later turn')
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
export function createTurnOrchestrator({ prompt = null, deliver = null, faces = {}, bindings = null, clock = () => new Date().toISOString() } = {}) {
  const owners = resolveOwners(bindings)
  const known = Object.keys(owners)
  const turns = new Map()
  const counts = { opened: 0, assembled: 0, delivered: 0, parsed: 0, refused: 0, dispatched: 0, notExecuted: 0 }
  const lastRefusal = { code: null, message: null }
  let seq = 0

  const fail = (code, message, hint) => { counts.refused += 1; lastRefusal.code = code; lastRefusal.message = message; throw refuse(code, message, hint) }

  /** ① open a turn: who, which round, which phase, which task. */
  const open = ({ member, role = null, phase, task = null, why = null, nextStep = null, round = 1 } = {}) => {
    if (typeof member !== 'string' || member.trim() === '') fail('VMU_INVALID_ARGUMENT', 'a turn needs a member', 'pass { member, phase }')
    if (typeof phase !== 'string' || !PHASES.includes(phase)) {
      fail('VMU_INVALID_ARGUMENT', 'unknown phase: ' + String(phase), 'known phases: ' + PHASES.join(', '))
    }
    seq += 1
    const turn = { id: 't-' + seq, member, role, phase, task, why, nextStep, round, at: clock() }
    turns.set(turn.id, turn)
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
    const out = await prompt.assemble({ member: turn.member, role: turn.role, phase: turn.phase, task: turn.task, round: turn.round })
    if (!out || out.ok !== true) {
      fail('VMU_TURN_ASSEMBLY_FAILED', 'the prompt pipeline refused this turn: ' + JSON.stringify((out && out.refused) || {}).slice(0, 160))
    }
    counts.assembled += 1
    return { ok: true, text: out.text, sources: out.sources || [], truncation: out.truncation || null }
  }

  /** ③ deliver through the adapter seam. A missing adapter is refused, never faked. */
  const deliverTurn = async (turn, text) => {
    if (typeof deliver !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'no delivery adapter is wired: refusing rather than pretending the member answered',
        'inject { deliver: async ({ turn, text }) => reply } (docs/26 §2 stage 3)')
    }
    const reply = await deliver({ turn, text })
    counts.delivered += 1
    return reply
  }

  /** ④ parse strictly: no fence, bad JSON and unknown fields are three different named refusals. */
  const parse = (text) => {
    const body = extractFence(text)
    if (body === null) fail('VMU_TURN_NO_FENCE', 'the reply carries no json fence, so there is nothing to apply',
      'ask for exactly one fenced json object (docs/26 §3)')
    let obj = null
    try { obj = JSON.parse(body) } catch (e) {
      fail('VMU_TURN_BAD_JSON', 'the fenced block is not valid JSON: ' + String(e && e.message).slice(0, 120))
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('VMU_TURN_BAD_JSON', 'the fenced block must be a JSON OBJECT')
    const unknown = Object.keys(obj).filter((k) => !Object.prototype.hasOwnProperty.call(owners, k))
    if (unknown.length) {
      fail('VMU_TURN_UNKNOWN_FIELD', 'unknown reply field(s): ' + unknown.join(', ') + ' - refusing rather than guessing what was meant',
        'known fields: ' + known.join(', '))
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
   */
  const apply = async (reply, faceMap = null) => {
    const map = faceMap || faces
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
    return { ok: true, executed, skipped, planned: dispatches.length }
  }

  /** One full turn, in order. Returns the turn receipt rather than making the caller re-implement the sequence. */
  const run = async (spec) => {
    const { turn } = open(spec)
    const asm = await assemble(turn)
    const raw = await deliverTurn(turn, asm.text)
    const parsed = parse(raw)
    const out = await apply(parsed.reply)
    return { ok: true, turn, assembled: { chars: asm.text.length, sources: asm.sources.length }, fields: parsed.fields, ...out }
  }

  return {
    open, assemble, deliver: deliverTurn, parse, plan, apply, run,
    status: () => ({ apiVersion, turns: turns.size, fields: known.length, owners, counts: { ...counts }, lastRefusal: { ...lastRefusal } }),
  }
}

export default createTurnOrchestrator
