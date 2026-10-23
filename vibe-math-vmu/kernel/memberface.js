// vmu kernel · member face gate — the CALL-TIME half of rule D7 ("available commands differ per member and per seat").
//
// WHAT THIS MODULE IS, AND IS NOT.
//   · The FACE itself (which tool names a seat may use) is decided by the pack declaration, resolved at request time by
//     `kernel.resolveMemberToolDeny()` (kernel/index.js:2374-2392). That resolver reads the LIVE roster, so a member hired
//     after the declaration still gets its face. This module NEVER re-derives that set: it consumes the resolver's answer.
//     (A second deny computation is exactly the 20-vs-22 drift this file exists to prevent.)
//   · The WIRE half — dropping the tools from the request so the member is not offered them — is the host's
//     (`host.js:1552-1560`). This module is what the host calls when it wants to know whether a *named* call is inside the
//     face, and what `toolsView` projects as `hidden`.
//
// PROPERTIES (deliberate): pure — no settings, no disk, no bus, no clock, no mutation; never throws. An unresolvable face
// FAILS CLOSED: it refuses the call and says why, instead of guessing the full catalogue. Admission over denial.
//
// WHY THE GATE MATTERS AT ALL: hiding a tool at the wire does not, by itself, prove a call to it is refused — the wire is
// a *presentation* of what the model was offered, not an authorization boundary. `faceGate()` is that boundary, and it
// reads the SAME resolved face the wire was filtered with, so the two readings cannot drift apart.

/** The two named refusals. Registered in docs/03 §8 (both tables). */
export const FACE_CODES = Object.freeze({
  /** The call names a tool the member's resolved face keeps out. */
  NOT_IN_FACE: 'VMU_TOOL_NOT_IN_FACE',
  /** No face could be resolved for that member/seat — the call is refused rather than allowed. */
  UNRESOLVED: 'VMU_TOOL_FACE_UNRESOLVED',
})

/** Where the exclusion came from. `seat` = the pack's per-slot face; `turn` = this turn's narrower override. */
export const FACE_REASONS = Object.freeze(['seat', 'turn'])

/** Third, honest reason used by `hiddenNames()`: the pack declared the tool but the host did not offer it this turn. */
export const HIDDEN_CATALOGUE = 'catalogue'

const isName = (v) => typeof v === 'string' && v.trim() !== ''
const nameOf = (v) => (typeof v === 'string' ? v.trim() : '')
const listOf = (v) => (Array.isArray(v) ? v.filter(isName).map((n) => n.trim()) : [])

/**
 * Resolve ONE face for a slot out of the shapes the kernel/host can hold.
 * `faces` may be: the resolver's answer (a single record), an array of `{ slot, allow, deny, all, source }`, or a map
 * `{ [slot]: {...} }`. Anything that cannot be resolved is a NAMED refusal, never a default-open face.
 * @returns {{ok:true, slot:string, allow:(string[]|null), deny:string[], all:boolean, source:(string[]|null)}}
 *        | {{ok:false, code:string, message:string, hint:string, face:null}}
 */
export function resolveFace({ faces = null, slot = null } = {}) {
  const wanted = nameOf(slot)
  const unresolved = (message, hint) => ({
    ok: false, code: FACE_CODES.UNRESOLVED, message, hint, face: null,
  })
  if (!faces) {
    return unresolved(
      'no member face was supplied, so there is no face to read for seat "' + (wanted || '(none)') + '"',
      'pass the face the request was filtered with — an unresolved face fails CLOSED (the full catalogue is never assumed)',
    )
  }
  let record = null
  let resolvedSlot = wanted
  if (Array.isArray(faces)) {
    if (faces.length === 0) {
      return unresolved('the face list is empty, so seat "' + (wanted || '(none)') + '" has no face on this kernel',
        'declare a per-slot face in the pack (manifest toolFaces) or state which slot the call belongs to')
    }
    if (!wanted) {
      return unresolved('a face list was supplied without a seat id, so no entry can be selected',
        'pass the member\'s seat (slot) together with the face list')
    }
    record = faces.find((f) => f && nameOf(f.slot) === wanted) || null
    if (!record) {
      return unresolved('no face entry matches seat "' + wanted + '"',
        'faces are per seat; an unknown seat is refused instead of borrowing another seat\'s face')
    }
  } else if (typeof faces === 'object') {
    // A RESOLVED RECORD (the kernel resolver's own answer) is accepted first: it already names its seat, so it must not
    // be mistaken for a `{ [seat]: face }` map (that mistake refused every resolved face — caught by the parity pair).
    const looksLikeRecord = ('allow' in faces) || ('deny' in faces) || ('all' in faces)
    if (looksLikeRecord) {
      record = faces
      resolvedSlot = nameOf(faces.slot) || wanted
      if (!resolvedSlot) {
        return unresolved('the supplied face record does not name its seat',
          'pass { slot, allow, deny, all, source } — the gate reports the seat in its refusal')
      }
    } else if (wanted) {
      record = faces[wanted] || null
      if (!record) {
        return unresolved('no face entry matches seat "' + wanted + '"',
          'faces are per seat; an unknown seat is refused instead of borrowing another seat\'s face')
      }
    } else {
      return unresolved('a face map was supplied without a seat id, so no entry can be selected',
        'pass the member\'s seat (slot) together with the face map')
    }
  } else {
    return unresolved('the supplied face is neither a record, a list nor a map',
      'pass the resolver answer ({ slot, allow, deny, all, source })')
  }
  if (!record || typeof record !== 'object') {
    return unresolved('the face entry for seat "' + (wanted || '(none)') + '" is not an object', 'pass { allow, deny, all }')
  }
  const allowRaw = record.allow
  const denyRaw = record.deny
  if (allowRaw !== null && allowRaw !== undefined && !Array.isArray(allowRaw)) {
    return unresolved('the face for seat "' + (wanted || '(none)') + '" has a non-array allow list',
      'a face allow list is an array of tool names, or null for "no allow-narrowing"')
  }
  if (denyRaw !== null && denyRaw !== undefined && !Array.isArray(denyRaw)) {
    return unresolved('the face for seat "' + (wanted || '(none)') + '" has a non-array deny list',
      'a face deny list is an array of tool names')
  }
  return {
    ok: true,
    slot: resolvedSlot,
    allow: Array.isArray(allowRaw) ? listOf(allowRaw) : null,
    deny: listOf(denyRaw),
    all: record.all === true,
    source: Array.isArray(record.source) ? record.source.slice() : (record.source === undefined ? null : [String(record.source)]),
  }
}

/**
 * THE CALL-TIME GATE. Mirrors the wire filter in `host.js:1552-1560` exactly, in the same order:
 *   1. `all` (this turn admits no tool at all) ⇒ out;
 *   2. `allow` narrowing (when present, membership in allow is the ONLY rule — deny is not consulted, as on the wire);
 *   3. otherwise membership in `deny` decides.
 * An empty/unknown tool name or an unresolvable face is refused by name.
 * @returns {{ok:true, member:null|string, slot:string, tool:string, face:object}}
 *        | {{ok:false, code:string, message:string, hint:string, tool:string, member:null|string, slot:string, face:(object|null)}}
 */
export function faceGate({ member = null, slot = null, toolName = null, faces = null } = {}) {
  const who = member === null || member === undefined ? null : nameOf(member)
  const tool = nameOf(toolName)
  const notInFace = (resolved, why) => ({
    ok: false,
    code: FACE_CODES.NOT_IN_FACE,
    member: who,
    slot: resolved.slot || nameOf(slot),
    tool,
    message: 'tool "' + tool + '" is outside the ' + (resolved.slot || nameOf(slot) || '(unknown)') + ' face' + (why ? ' — ' + why : ''),
    hint: 'the face keeps this tool out for this seat; ask that seat to do it, or read the seat\'s visible table (toolsView) instead of assuming the call is allowed',
    face: { slot: resolved.slot || nameOf(slot), allow: resolved.allow, deny: resolved.deny, all: resolved.all, source: resolved.source },
  })
  if (tool === '') {
    return {
      ok: false, code: 'VMU_INVALID_ARGUMENT', member: who, slot: nameOf(slot), tool: '',
      message: 'the face gate needs a tool name to decide about', hint: 'pass toolName:"<the tool the member is about to call>"', face: null,
    }
  }
  const resolved = resolveFace({ faces, slot })
  if (resolved.ok !== true) {
    if (resolved.code !== FACE_CODES.UNRESOLVED) return resolved
    return {
      ok: false, code: resolved.code, member: who, slot: nameOf(slot), tool,
      message: resolved.message, hint: resolved.hint, face: null,
    }
  }
  if (resolved.all === true) return notInFace(resolved, 'this turn admits no tool at all')
  if (Array.isArray(resolved.allow)) {
    if (!resolved.allow.includes(tool)) return notInFace(resolved, 'it is not in this face\'s allow list')
    return { ok: true, member: who, slot: resolved.slot, tool, face: { slot: resolved.slot, allow: resolved.allow, deny: resolved.deny, all: false, source: resolved.source } }
  }
  if (resolved.deny.includes(tool)) return notInFace(resolved, 'it is on this face\'s deny list')
  return { ok: true, member: who, slot: resolved.slot, tool, face: { slot: resolved.slot, allow: null, deny: resolved.deny, all: false, source: resolved.source } }
}

/**
 * THE READ HALF: `hidden` = the tools the face keeps away from this member, derived from ONE comparison
 * (`declared` minus what the request actually offers) and labelled with the reason each name is missing.
 * Every entry is an existing fact; nothing here decides policy.
 *   · `reason:'seat'`      — the pack's per-seat face keeps it out;
 *   · `reason:'turn'`      — this turn's narrowing override keeps it out;
 *   · `reason:'catalogue'` — the pack declared it but the host offered no such tool this turn (no face involved).
 * @param {{declared?:Array<string|{name:string}>, visible?:Array<string|{name:string}>, face?:object}} args
 * @returns {Array<{name:string, reason:string, source:string}>}
 */
export function hiddenNames({ declared = [], visible = [], face = null } = {}) {
  const names = (list) => (Array.isArray(list) ? list.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(isName).map((n) => n.trim()) : [])
  const shown = new Set(names(visible))
  const out = []
  for (const name of names(declared)) {
    if (shown.has(name)) continue
    const seatKeeps = !!(face && (face.all === true || (Array.isArray(face.allow) && !face.allow.includes(name)) || listOf(face.deny).includes(name)))
    const turnKeeps = !!(face && Array.isArray(face.source) && face.source.includes('turn'))
    const reason = turnKeeps && seatKeeps ? 'turn' : (seatKeeps ? 'seat' : HIDDEN_CATALOGUE)
    const source = reason === 'turn' ? 'turn-override' : (reason === 'seat' ? 'pack-face' : 'host-catalogue')
    out.push({ name, reason, source })
  }
  return out
}
