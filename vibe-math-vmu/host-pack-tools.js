/**
 * host-pack-tools.js — PHASE 6 / P0-10: the HOST half of a PACK-DECLARED tool face.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT INSIDE host.js. The rule this card implements is
 * "the tool NAME is the institution's language, so the PACK declares it; the framework only
 * publishes what a pack declared". `host.js` already owns the face -> tool-spec machinery and
 * sits at the repository's 1200-line ceiling (a file at the ceiling may only get SMALLER), so
 * the pack-tool spec factory lives here and `host.js` gains one import plus one call.
 *
 * WHAT IT OWNS / WHAT IT DOES NOT:
 *   · it builds an INTERNAL tool spec ({ name, description, parameters, face, reason, run }) —
 *     the same shape every `makeXSpec` in `tools/*.js` returns. `host.js#toHostSpec` is the ONE
 *     place that turns such a spec into the host's shape and the ONE place that serializes the
 *     result (`boundedToolResult`). So a pack handler returns an OBJECT and is stringified
 *     exactly once, downstream — never here.
 *   · it does NOT know the framework's own tool names. The caller passes the reserved set
 *     (`host.js` passes `TOOL_NAMES`), which is both why this file needs no import from
 *     `host.js` (no dependency cycle) and why the collision rule cannot drift from the surface
 *     it protects.
 *   · it does NOT execute anything on its own: `run` calls the pack manifest's handler with
 *     `{ kernel, exec, packId }`. A handler that must refuse throws an Error carrying a
 *     REGISTERED code (or returns `{ ok:false, code, message, hint }`); `toHostSpec` turns a
 *     throw into the same named-refusal receipt every other face produces.
 *
 * ZERO MECHANISM: nothing here runs unless a pack declares `tools` and the kernel holds those
 * declarations (`kernel.packTools()`); an assembly with no such pack gets an empty list.
 *
 * ★ PHASE 12 / D7 — THE SEAT FACE GATE (`faceGate`) IS WIRED HERE, and this is the ONE漏斗 every
 * pack tool goes through. The seat face (`pack.toolFaces`, resolved by the kernel at
 * `kernel/index.js#resolveMemberToolDeny`) already NARROWS what the wire offers a member; hiding a
 * tool from the request is not the same as refusing it, so the decision is re-asked here, BEFORE
 * the handler runs, and a member outside its face gets a named refusal instead of a silent
 * execution. The predicate is `kernel/memberface.js#faceGate` — the same one `toolsView().hidden[]`
 * reports from, so "what you cannot see" and "what is refused" cannot drift apart.
 *   · ROOT sessions (`session-…`) have no member ⇒ allowed (a root agent is not a seat; v5r's
 *     `deliverMode:'caller'` really does drive packs from the root agent).
 *   · a member whose face cannot be resolved ⇒ fail-CLOSED (`VMU_TOOL_FACE_UNRESOLVED`), never
 *     "could not tell, so let it through".
 *   · no kernel at all ⇒ the spec factory is being used standalone (unit tests, planning): there is
 *     no seat to resolve and no declaration to honour, so the gate is skipped, and says so.
 *
 * NO IMPORT: the predicate is reached THROUGH the kernel (`kernel.memberFaceGate`, which is
 * `kernel/memberface.js#faceGate` applied to the kernel's own `resolveMemberToolDeny`), so this file
 * keeps its "no import from the kernel or host" property and there is exactly ONE deny computation.
 */
const str = (v) => (v === undefined || v === null ? '' : String(v))

/**
 * ★ R26 (live run 18, MEASURED): the agent called `vibe_v5_set { key, value, reason }` while the face
 * declares `{ key, value, why }`. The handler destructured what it knows, never saw `reason`, and the
 * call SUCCEEDED for a different key type — so a misspelled parameter name produced a receipt that
 * looked like a normal answer to a question the caller had not asked. That is the "declared but not
 * consumed" defect one layer up, on the CALLER's side, and the declaration already carries the fix:
 * the parameter MAP is the accepted vocabulary, so an undeclared key can be refused by name.
 *
 * Why here: `makePackToolSpec().run` is the ONE funnel every pack tool goes through, so the check is
 * unavoidable and cannot drift tool by tool. It refuses BEFORE the handler (no side effect) and
 * BEFORE the seat-face gate (shape is not authority — and the declaration is public anyway).
 */
export function unknownParametersOf(entry = null, args = null) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return []
  const declared = entry && entry.parameters && typeof entry.parameters === 'object' ? entry.parameters : {}
  const known = new Set(Object.keys(declared))
  return Object.keys(args).filter((k) => !known.has(k))
}

/**
 * The pack tools whose names the host already publishes as its OWN tools. A collision is a
 * named refusal (the adapter records it in `failures` with a registered code), never a silent
 * shadow: two tools with one name would make "which one does the model call" unanswerable.
 */
export function packToolCollisions(entries = [], reserved = []) {
  const taken = new Set((Array.isArray(reserved) ? reserved : []).map(str))
  const out = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = entry && typeof entry.name === 'string' ? entry.name : ''
    if (name && taken.has(name)) out.push(name)
  }
  return out
}

/** The failure rows an adapter reports for those collisions (registered code, caller's vocabulary). */
export function packToolFailureRows(entries = [], reserved = []) {
  return packToolCollisions(entries, reserved).map((name) => ({
    name,
    code: 'VMU_PACK_CONFLICT',
    message: 'pack tool "' + name + '" collides with a tool this host already publishes; it was NOT registered',
    hint: 'rename the pack tool — the framework\'s own tool keeps its name',
  }))
}

/** The agent id this call was dispatched for ('' when the host did not pass one). */
function agentIdOf(exec) {
  return String((exec && exec.agent && exec.agent.id) || '')
}

/**
 * WHICH MEMBER is this call for? The SAME criterion the assembler uses (`host.js:1484-1495`,
 * copied — `host.js` is a closure and must not be imported): the turn tool's record first (only for
 * a non-root agent id; root ids are `session-…` and have no member), then the learned session map
 * (`kernel.memberSession(row.id) === agent.id`), then an exact roster id.
 *
 * Returns a roster id or `null` — and `null` is a REAL answer (root/non-member), NOT "could not
 * tell". The fail-closed decision lives in `packToolFaceGate` below.
 */
export function resolveTurnMember(kernel = null, exec = null) {
  if (!kernel || typeof kernel !== 'object') return null
  const agentId = agentIdOf(exec)
  const nonRoot = agentId !== '' && !agentId.startsWith('session-')
  if (nonRoot && typeof kernel.currentTurnMember === 'function') {
    const m = kernel.currentTurnMember()
    if (typeof m === 'string' && m !== '') return m
  }
  if (agentId === '') return null
  let roster = []
  try { roster = kernel.members && typeof kernel.members.roster === 'function' ? kernel.members.roster() : [] } catch { roster = [] }
  for (const row of Array.isArray(roster) ? roster : []) {
    if (!row || typeof row.id !== 'string') continue
    if (row.id === agentId) return row.id
    try { if (typeof kernel.memberSession === 'function' && kernel.memberSession(row.id) === agentId) return row.id } catch { /* keep looking */ }
  }
  return null
}

/**
 * The refusal receipt for a member outside its seat face, with the tools it CAN see spelled out.
 * The visible list is PRESENTATION (a hint) — the decision is `faceGate`'s, the same predicate the
 * wire filter and `toolsView().hidden[]` use, so this cannot become a second opinion.
 */
function outOfFaceRefusal(kernel, member, verdict, declaredNames) {
  const shown = str(verdict && verdict.toolName) || '(this tool)'
  let visible = []
  try {
    const resolved = typeof kernel.resolveMemberToolDeny === 'function' ? kernel.resolveMemberToolDeny(member) : null
    if (resolved && Array.isArray(declaredNames)) {
      visible = resolved.all
        ? []
        : (Array.isArray(resolved.allow)
          ? declaredNames.filter((n) => resolved.allow.includes(n))
          : declaredNames.filter((n) => !resolved.deny.includes(n)))
    }
  } catch { visible = [] }
  const face = str(verdict && verdict.face) || (str(verdict && verdict.slot) ? 'seat:' + str(verdict.slot) : 'seat')
  return {
    ok: false,
    code: 'VMU_TOOL_NOT_IN_FACE',
    message: 'member "' + member + '" may not call "' + shown + '": it is outside this member\'s seat face (' + face + ')',
    hint: visible.length > 0
      ? 'this member may call: ' + visible.join(', ')
      : 'this member\'s seat face allows no pack tool at all in this turn',
    face,
    member,
    toolName: shown,
  }
}

/**
 * THE GATE. Called by `makePackToolSpec().run` before the handler, so a refusal cannot leave a
 * side effect behind. Read-only: resolves the member + its face, asks `faceGate`, returns a verdict
 * — never throws for a decision, never writes.
 */
export function packToolFaceGate({ kernel = null, exec = null, toolName = '', declaredNames = null } = {}) {
  const name = str(toolName)
  if (!name) throw new Error('packToolFaceGate needs a toolName')
  if (!kernel || typeof kernel !== 'object') return { ok: true, member: null, skipped: 'no-kernel' }
  const member = resolveTurnMember(kernel, exec)
  if (!member) return { ok: true, member: null, skipped: 'root-or-non-member' }
  if (typeof kernel.memberFaceGate !== 'function') {
    return {
      ok: false,
      code: 'VMU_TOOL_FACE_UNRESOLVED',
      message: 'cannot resolve the seat face for member "' + member + '": this kernel has no face resolver',
      hint: 'seat the member through the kernel (a tool face applies to a SEATED member) before calling pack tools',
      member,
      toolName: name,
    }
  }
  let verdict = null
  let failure = null
  try { verdict = kernel.memberFaceGate({ member, toolName: name }) } catch (err) { failure = err }
  if (failure) {
    return {
      ok: false,
      code: 'VMU_TOOL_FACE_UNRESOLVED',
      message: 'the seat face for member "' + member + '" could not be resolved: ' + str(failure && failure.message),
      hint: str(failure && failure.hint) || 'seat the member first, or declare toolFaces for its slot',
      member,
      toolName: name,
    }
  }
  if (verdict && verdict.ok === false) {
    let names = Array.isArray(declaredNames) ? declaredNames : null
    if (!names) {
      try { names = kernel.packTools().map((t) => t && t.name).filter((n) => typeof n === 'string') } catch { names = [] }
    }
    return outOfFaceRefusal(kernel, member, Object.assign({ toolName: name }, verdict), names)
  }
  return { ok: true, member, slot: (verdict && verdict.slot) || null }
}

/**
 * Turn one pack declaration into an INTERNAL tool spec (the shape `host.js#toHostSpec` consumes).
 *
 * The spec carries `face: 'pack:<id>'` and a `reason`, so the status receipt's provenance block
 * reports WHERE the name came from instead of leaving it unexplained (the same provenance rule
 * every face tool has had since round 26).
 */
export function makePackToolSpec({ entry, kernel = null, packId = null } = {}) {
  const name = entry && typeof entry.name === 'string' ? entry.name : ''
  if (!name) throw new Error('makePackToolSpec needs a tool entry with a name')
  const id = packId !== null && packId !== undefined
    ? str(packId)
    : (entry.packId === undefined || entry.packId === null ? 'pack' : str(entry.packId))
  return {
    name,
    description: typeof entry.description === 'string' ? entry.description : '',
    // The INTERNAL parameter map: `toHostSpec` wraps it as the object-schema the host accepts.
    parameters: entry.parameters && typeof entry.parameters === 'object' ? entry.parameters : {},
    face: 'pack:' + id,
    reason: 'declared by pack ' + id + ' (tools[] in its manifest)',
    run: async (args, exec) => {
      const handler = entry && entry.handler
      if (typeof handler !== 'function') {
        throw Object.assign(new Error('pack tool ' + name + ' has no handler function'),
          { code: 'VMU_PACK_MISSING', hint: 'declare tools[i].handler in the pack manifest' })
      }
      // ★ R26: an undeclared parameter is refused BY NAME rather than dropped. Measured in live run
      // 18: `vibe_v5_set { key, value, reason }` executed while the face declares `why`.
      // ★★ LIVE RUN 29: A PACK MAY GIVE THE SHARPER REFUSAL FIRST. `vibe_v5_meeting` is convene-only, so passing
      // `action:"status"` is not merely an undeclared key — it is a call from the WRONG FACE, and the pack's own message
      // ("this face only CONVENES; read it with vibe_vmu_meeting {action:…}") sends the reader to the right place while
      // this layer's generic sentence sends it to the declaration. `validate(args)` is the pack's chance to refuse with
      // its own vocabulary; the gate below still runs for everything it does not claim (a safety net, not a bypass).
      if (entry && typeof entry.validate === 'function') {
        const verdict = await entry.validate(args)
        if (verdict && verdict.ok === false) {
          throw Object.assign(new Error(verdict.message || ('pack tool ' + name + ' refused this call')),
            { code: verdict.code || 'VMU_INVALID_ARGUMENT', hint: verdict.hint || null })
        }
      }
      const unknown = unknownParametersOf(entry, args)
      if (unknown.length > 0) {
        const declaredMap = entry.parameters && typeof entry.parameters === 'object' ? entry.parameters : {}
        const known = Object.keys(declaredMap)
        throw Object.assign(new Error('pack tool ' + name + ' does not accept parameter(s) ' + unknown.map((k) => '"' + k + '"').join(', ') +
          '; it declares: ' + (known.length > 0 ? known.join(', ') : '(none)')),
        { code: 'VMU_INVALID_ARGUMENT', hint: 'check the parameter names against the tool declaration — an undeclared key would otherwise be dropped silently, and the call would succeed for reasons nobody recorded' })
      }
      // ★ THE SEAT FACE GATE — BEFORE the handler, so a refusal cannot leave a side effect behind.
      // The assembler already narrowed the wire, but a hidden tool is not a refused tool; this is
      // where "this member may not call that" becomes a named receipt.
      const gate = packToolFaceGate({ kernel, exec, toolName: name })
      if (gate.ok === false) {
        throw Object.assign(new Error(gate.message), { code: gate.code, hint: gate.hint, face: gate.face })
      }
      const out = await handler(args && typeof args === 'object' ? args : {}, { kernel, exec: exec || null, packId: id })
      // THE CONTRACT: a handler returns an OBJECT (or returns nothing). A non-object is wrapped
      // rather than passed through, because a bare string would be JSON-encoded a SECOND time by
      // the one serializer downstream (`boundedToolResult` stringifies a string as a JSON string).
      if (out === undefined) return { ok: true, tool: name }
      if (out === null || typeof out !== 'object' || Array.isArray(out)) return { ok: true, tool: name, value: out }
      return out
    },
  }
}

/**
 * Append every non-colliding pack tool to a spec list (used by `host.js#toolSpecs`). The list is
 * the caller's; nothing is registered here. Returns the names it appended, for a caller that
 * wants to state what the declaration produced.
 */
export function appendPackToolSpecs(specs = [], entries = [], reserved = [], kernel = null) {
  const collisions = new Set(packToolCollisions(entries, reserved))
  const appended = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.name !== 'string' || collisions.has(entry.name)) continue
    specs.push(makePackToolSpec({ entry, kernel }))
    appended.push(entry.name)
  }
  return { appended, collisions: [...collisions] }
}
