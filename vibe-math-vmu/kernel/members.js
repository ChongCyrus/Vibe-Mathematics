// vmu members — role SLOTS, capacity and wake envelopes (docs/02 §2 partition A, docs/03 §2.1).
//
// The decision this module encodes is D5: the kernel offers role SLOTS, never roles. No role name from
// the v5r line appears anywhere in this file - a slot is a name, a capacity and a list of OPAQUE
// permission strings, all supplied by a pack through settings. The kernel's whole job is:
//   · to record who currently occupies which slot;
//   · to ENFORCE capacity as a machine limit, refusing by name with the current count and the cap
//     (docs/08 §3, the S25-E lesson: a limit the machine cannot enforce is a suggestion, not a limit);
//   · to build a wake envelope and hand it to an injected deliver seam, so the module itself never
//     calls the host (docs/11 §4.1: a missing seam is refused by name, never faked).
//
// Zero policy check (asserted by tests/vmu-members.test.mjs): the source contains none of the role names
// the v5r line used, and nothing here decides what a permission MEANS.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

const SLOT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const MEMBER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

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

    /** Convenience over assignRole with the institute-wide live-member cap applied as well. */
    async hire({ id, slot } = {}) {
      // The RESOURCE gate first: `vmu.limits.memoryCeilingMb` is the HOST process RSS ceiling, and refusing to
      // grow the roster when the process is already over it is the whole point of the key (docs/04 §11).
      if (typeof resourceGate === 'function') {
        const gate = resourceGate()
        if (gate && gate.exceeded === true) {
          throw refuse('VMU_RESOURCE_BUDGET',
            'host process RSS over the ceiling: ' + gate.rssMb + 'MB > ' + gate.ceilingMb + 'MB',
            'vmu.limits.memoryCeilingMb caps the HOST process (docs/04 §11); raise it, or end members first')
        }
      }
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
