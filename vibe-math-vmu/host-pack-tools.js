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
 */
const str = (v) => (v === undefined || v === null ? '' : String(v))

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
