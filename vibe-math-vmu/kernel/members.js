// vmu members — role SLOTS, capacity and wake envelopes (docs/02 §2 partition A, docs/03 §2.1).
//
// The decision this module encodes is D5: the kernel offers role SLOTS, never roles. No role name from
// the v5r line appears anywhere in this file - a slot is a name, a capacity and a list of OPAQUE
// permission strings, all supplied by a pack through settings. The kernel's whole job is:
//   · to record who currently occupies which slot;
//   · to ENFORCE capacity as a machine limit, refusing by name with the current count and the cap
//     (docs/08 §3, the S25-E lesson: a limit the machine cannot enforce is a suggestion, not a limit);
//   · to build a wake envelope and hand it to an injected deliver seam, so the module itself never
//     calls the host (docs/11 §4.1: a missing seam is refused by name, never faked);
//   · ROUND 132: to record a member's OWN self-report (v5r's `self_report`, G6) VERBATIM and APPEND-ONLY -
//     `overall`/`subgoal`/`plan`/`status` - and to expose the latest one per member for the overview. The kernel
//     records and never judges; who may write WHOSE report is policy and stays outside (only `by` is recorded).
//
// Zero policy check (asserted by tests/vmu-members.test.mjs): the source contains none of the role names
// the v5r line used, and nothing here decides what a permission MEANS.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** D3 (round 26): the refusal states its EVALUATION SCOPE — `enforcedScope:'evaluated-so-far'` says in words
 *  that any key list travelling with it is "what was consulted SO FAR", never the operation's full key set. */
export const ENFORCED_SCOPE = 'evaluated-so-far'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforcedScope = ENFORCED_SCOPE
  return err
}

const SLOT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const MEMBER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** ROUND 132: the field vocabulary of a self-report. `overall` is required; the rest are optional. */
const SELF_REPORT_FIELDS = Object.freeze(['overall', 'subgoal', 'plan', 'status'])

/**
 * Create the roster. `slots` are pack-declared role slots; `maxLiveMembers` and per-slot `capacity` are
 * the machine-enforced limits; `deliver` is the wake seam.
 */
export function createMembers({
  slots = [],
  maxLiveMembers = 0,
  deliver = null,
  bus = null,
  clock = () => new Date().toISOString(),
  // `resourceGate` closes the `vmu.limits.memoryCeilingMb` loop: the kernel supplies a function reporting
  // whether the HOST process RSS is over the declared ceiling, and hire() refuses by name when it is.
  resourceGate = null,
} = {}) {
  const slotDefs = new Map()
  const members = new Map()
  // ROUND 132: the append-only self-report log (id -> [ { at, by, fields } ]). Named `reportLog` on purpose -
  // calling it `selfReports` would sit next to the `selfReports()` method and read like a recursive call.
  const reportLog = new Map()

  for (const raw of slots) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !SLOT_ID.test(raw.id)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a role slot needs a kebab-case id', JSON.stringify(raw))
    }
    const capacity = raw.capacity === undefined || raw.capacity === null ? 0 : raw.capacity
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'slot ' + raw.id + ': capacity must be an integer >= 0 (0 = unlimited)')
    }
    if (slotDefs.has(raw.id)) throw refuse('VMU_MIDDLEWARE_FAILED', 'duplicate role slot: ' + raw.id)
    slotDefs.set(raw.id, {
      id: raw.id,
      label: raw.label === undefined ? raw.id : String(raw.label),
      capacity,
      permissions: Array.isArray(raw.permissions) ? raw.permissions.map(String) : [],
      source: raw.source || 'pack',
    })
  }

  const occupancy = (slotId) => [...members.values()].filter((m) => m.slot === slotId).length
  const live = () => [...members.values()].filter((m) => m.state !== 'ended')

  const assertSlot = (slotId) => {
    const def = slotDefs.get(slotId)
    if (!def) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown role slot: ' + String(slotId),
        'declared slots: ' + ([...slotDefs.keys()].join(', ') || '(none)'))
    }
    return def
  }

  const member = (id) => {
    const m = members.get(id)
    if (!m) throw refuse('VMU_NO_SUCH_OBJECT', 'no member with id ' + String(id), 'call roster() for the current roster')
    return m
  }

  return {
    /** The declared slots (kernel view: names, capacities, opaque permissions). */
    roles() {
      return [...slotDefs.values()].map((s) => ({
        id: s.id, label: s.label, capacity: s.capacity, permissions: s.permissions.slice(),
        occupied: occupancy(s.id), source: s.source,
      }))
    },

    /** The roster. Never carries a decision, only who is here and in which slot. */
    roster() {
      return [...members.values()].map((m) => ({
        id: m.id, slot: m.slot, state: m.state, since: m.since, wakes: m.wakes,
        endedAt: m.endedAt || null, endedReason: m.endedReason || null,
      }))
    },

    /** Place a member into a slot, enforcing that slot's capacity by name. */
    async assignRole(id, slotId) {
      if (typeof id !== 'string' || !MEMBER_ID.test(id)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'member id is required and must be path-safe: ' + String(id))
      }
      // THE CEILING IS ENFORCED HERE TOO. `assignRole` is a PUBLISHED service (docs/03 §2), so gating only
      // `hire()` made the ceiling bypassable from a pack or an M3 script (verifier's task-34 finding #3). The
      // gate applies only when this call would GROW the roster: re-assigning an already-live member is not growth.
      const already = members.get(id)
      const isGrowth = !(already && already.state !== 'ended')
      if (isGrowth && typeof resourceGate === 'function') {
        const gate = resourceGate()
        if (gate && gate.exceeded === true) {
          throw refuse('VMU_RESOURCE_BUDGET',
            'host process RSS over the ceiling: ' + gate.rssMb + 'MB > ' + gate.ceilingMb + 'MB',
            'vmu.limits.memoryCeilingMb caps the HOST process (docs/04 §11); raise it, or end members first')
        }
      }
      const def = assertSlot(slotId)
      const existing = members.get(id)
      if (existing && existing.slot === slotId && existing.state !== 'ended') {
        return { ok: true, id, slot: slotId, unchanged: true }
      }
      const used = occupancy(slotId)
      if (def.capacity > 0 && used >= def.capacity && (!existing || existing.slot !== slotId)) {
        throw refuse('VMU_RESOURCE_BUDGET',
          'role slot ' + slotId + ' is full: ' + used + '/' + def.capacity,
          'capacity is a machine limit (docs/08 §3); raise it in the pack or end a member first')
      }
      const rec = existing
        ? Object.assign(existing, { slot: slotId, state: 'live', since: clock() })
        : { id, slot: slotId, state: 'live', since: clock(), wakes: 0 }
      members.set(id, rec)
      if (bus) await bus.emit('task/assign', { member: id, slot: slotId }, { member: id })
      return { ok: true, id, slot: slotId, occupied: occupancy(slotId), capacity: def.capacity }
    },

    /**
     * Convenience over assignRole. Each cap lives in exactly ONE place: `maxLiveMembers` here (a roster-wide
     * count, which assignRole does not know) and the HOST-RSS ceiling inside assignRole (which knows whether the
     * call would GROW the roster, so a no-op re-hire is never refused). The verifier's second round caught both
     * the duplicated gate read and the resulting false refusal; this is the single-point fix.
     */
    async hire({ id, slot } = {}) {
      if (maxLiveMembers > 0 && live().length >= maxLiveMembers && !members.has(id)) {
        throw refuse('VMU_RESOURCE_BUDGET',
          'live members at the ceiling: ' + live().length + '/' + maxLiveMembers,
          'vmu.limits.maxLiveMembers is machine-enforced (docs/04 §11)')
      }
      return this.assignRole(id, slot)
    },

    /** End a member. The reason is recorded, so "why is it gone" is answerable later. */
    async end(id, reason = 'ended') {
      const m = member(id)
      if (m.state === 'ended') return { ok: true, id, state: 'ended', unchanged: true }
      m.state = 'ended'
      m.endedAt = clock()
      m.endedReason = String(reason)
      if (bus) await bus.emit('member/wake-after', { member: id, ended: true }, { member: id })
      return { ok: true, id, state: 'ended', reason: m.endedReason }
    },

    /** Build a wake envelope and hand it to the injected seam; a missing seam is refused by name. */
    async wake(id, ask, { role, phase } = {}) {
      const m = member(id)
      if (m.state === 'ended') {
        throw refuse('VMU_STATE', 'member ' + id + ' has ended', 'roster() shows who is live')
      }
      if (typeof ask !== 'string' || ask.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a wake needs a non-empty ask')
      }
      if (bus) {
        const dec = await bus.emit('member/wake-before', { member: id, ask }, { member: id, role: m.slot, phase })
        if (dec && dec.ok === false) return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
      }
      const envelope = { member: id, slot: m.slot, ask, at: clock(), role: role === undefined ? m.slot : role, phase: phase === undefined ? null : phase }
      if (typeof deliver !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no wake seam is bound',
          'inject { deliver } - the kernel never calls the host itself (docs/11 §4.1)')
      }
      m.wakes += 1
      const result = await deliver(envelope)
      return { ok: true, envelope, delivered: result === undefined ? true : result }
    },

    /** Permission check over the slot's OPAQUE permission strings. The kernel never interprets them. */
    may(id, permission) {
      const m = member(id)
      const def = slotDefs.get(m.slot)
      const allowed = !!(def && def.permissions.includes(String(permission)))
      return { ok: true, allowed, member: id, slot: m.slot, permission: String(permission) }
    },

    // ── ROUND 132: the member's OWN self-report (v5r's `self_report`, G6) ────────────────────────────────
    /**
     * Record a self-report. APPEND-ONLY: every update is kept, so "what did this member say they were doing,
     * and when" stays answerable. `overall` is required (it is the headline the overview shows); the other
     * three are optional. The fields are stored verbatim and never interpreted here. `by` is recorded as an
     * audit fact and NOT enforced: who may write whose report is policy, and policy lives in middleware.
     */
    async selfReport(id, fields, { by } = {}) {
      const m = member(id)
      if (m.state === 'ended') {
        throw refuse('VMU_STATE', 'member ' + id + ' has ended',
          'roster() shows who is live; a self-report is for a member who is here')
      }
      const src = fields && typeof fields === 'object' ? fields : {}
      // Unknown fields are REFUSED by name rather than silently dropped: a report that quietly loses half of what
      // was declared is worse than one that says which key it did not understand (same rule as the Lean kinds).
      const unknown = Object.keys(src).filter((k) => SELF_REPORT_FIELDS.indexOf(k) === -1
        && src[k] !== undefined && src[k] !== null && String(src[k]).trim().length > 0)
      if (unknown.length) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown self-report field(s): ' + unknown.join(', '),
          'allowed: ' + SELF_REPORT_FIELDS.join(' / ') + ' (unknown fields are refused, never silently dropped)')
      }
      const picked = {}
      for (const k of SELF_REPORT_FIELDS) {
        const v = src[k]
        if (v !== undefined && v !== null && String(v).trim().length > 0) picked[k] = String(v)
      }
      if (!picked.overall) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a self-report needs a non-empty `overall`',
          'fields: ' + SELF_REPORT_FIELDS.join(' / ') + ' (overall is the headline; the rest are optional)')
      }
      const rec = { at: clock(), by: by === undefined ? id : String(by), fields: picked }
      const list = reportLog.get(id) || []
      list.push(rec)
      reportLog.set(id, list)
      if (bus) await bus.emit('member/self-report', { member: id, by: rec.by, fields: picked }, { member: id })
      return { ok: true, id, at: rec.at, by: rec.by, fields: Object.assign({}, picked), updates: list.length }
    },

    /** The LATEST self-report per member, plus how many updates each has made. Read-only; nothing is judged. */
    selfReports() {
      return [...reportLog.entries()].map(([id, list]) => {
        const last = list[list.length - 1]
        return { id, at: last.at, by: last.by, fields: Object.assign({}, last.fields), updates: list.length }
      })
    },

    /** One member's append-only history, OLDEST first. Unknown member is refused by name (never an empty list). */
    selfReportHistory(id) {
      member(id)
      return (reportLog.get(id) || []).map((r) => ({ at: r.at, by: r.by, fields: Object.assign({}, r.fields) }))
    },

    /** Observability (R11): slots with occupancy, live count, and the caps actually in force. */
    status() {
      return {
        slots: this.roles(),
        live: live().length,
        total: members.size,
        maxLiveMembers,
        caps: { maxLiveMembers },
        pendingDeliverSeam: typeof deliver !== 'function',
      }
    },
  }
}
