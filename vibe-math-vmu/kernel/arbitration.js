// vmu kernel · arbitration — conflict cases, recusal, hearings, rulings, appeals (docs/17 §6).
//
// Design source: docs/17-agent-society-and-delegation.md §6 (conflict & arbitration) and §20.4/§21.2
// (the `vmu.conflict.*` / `vmu.arbitration.*` keys and the VMU_CONFLICT_*/VMU_ARBITER_*/VMU_ARBITRATION_* codes).
// The two keys `vmu.arbitration.mode` and `vmu.arbitration.binding` are CO-DECLARED with docs/08 §19.6.
//
// FOUR ESSENTIALS (the task's hard requirements — each is a refusal, not a warning):
//   ① A PARTY MAY NOT ARBITRATE ITS OWN CASE (`vmu.conflict.arbiterMustDiffer`) ⇒ `VMU_ARBITER_IS_PARTY`,
//      NAMING the conflicting parties.
//   ② A RULING MUST STATE ITS RATIONALE (`vmu.arbitration.rationaleRequired`) ⇒ `VMU_REASON_REQUIRED`.
//   ③ EFFECT IS EXPLICIT: with `binding=false`, `effective()` says "advisory only" and never pretends to
//      enforce — and even with `binding=true` the kernel RECORDS a decision, it does not execute one.
//   ④ FAILING TO RECUSE INSIDE THE WINDOW IS REFUSED (`vmu.arbitration.recuseWindowMs`) ⇒ `VMU_DUTY_CONFLICT`
//      with the window and the moment it closed.
// Invariants (same set as the rest of the kernel — see kernel/board.js / kernel/metrics.js / kernel/delegation.js):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (list()/history())
//   · zero mechanism: `vmu.arbitration.mode=off` (the default) ⇒ every write is refused BY NAME
//     (`VMU_ARBITRATION_OFF`) and the read surfaces still answer; nothing throws at construction
//   · the only time source is the injected `clock`; case ids are deterministic (`c-1`, `c-2`, …)
//   · READ paths (list/history/effective/status/panelOf) never mutate the cases
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL, because the settings
// table and the docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_MODE = 'vmu.arbitration.mode'
const K_BINDING = 'vmu.arbitration.binding'
const K_IN_MINUTES = 'vmu.arbitration.recordInMinutes'
const K_PANEL_SIZE = 'vmu.arbitration.panelSize'
const K_RECUSE_WINDOW = 'vmu.arbitration.recuseWindowMs'
const K_RATIONALE = 'vmu.arbitration.rationaleRequired'
const K_APPEAL_WINDOW = 'vmu.arbitration.appealWindowMs'
const K_HEARING_NOTES = 'vmu.arbitration.hearingMinNotes'
const K_MUST_DIFFER = 'vmu.conflict.arbiterMustDiffer'
const K_ARBITER_RULE = 'vmu.conflict.arbiterRule'
const K_CLASSES = 'vmu.conflict.classes'
const K_COOLDOWN = 'vmu.conflict.cooldownMs'
const K_MAX_OPEN = 'vmu.conflict.maxOpen'
const K_ESCALATE_MAX = 'vmu.conflict.escalateMaxPerSubject'
const K_HEARING_MINUTES = 'vmu.conflict.hearingNeedsMinutes'
const K_APPEAL_HUMAN = 'vmu.conflict.appealToHuman'
// INTEGRATOR RULING: the task's alternative spellings (maxOpenCases / conflictClasses) are GONE. One knob, one
// name - reading two spellings means the read-side gate must declare two knobs, and nobody can tell which is real.

const MODES = Object.freeze(['off', 'single', 'panel'])
const ARBITER_RULES = Object.freeze(['senior-slot', 'random', 'mutual', 'human'])
const DEFAULT_LIST_CAP = 200
const FINAL_STATES = Object.freeze(['decided', 'closed'])

/**
 * createArbitration — the conflict/arbitration ledger. `members` is the seat seam (unused for authority here,
 * but reported), `minutes` is the optional minutes seam (`vmu.arbitration.recordInMinutes`), `log`/`bus` advisory.
 */
export function createArbitration({ clock = () => 0, log = null, settings = {}, bus = null, members = null, minutes = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createArbitration needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the arbitration it records */ } }
  }

  const modeRaw = sget(K_MODE, 'off')
  const mode = MODES.includes(modeRaw) ? modeRaw : 'off'
  const enabled = mode !== 'off'
  const binding = sget(K_BINDING, false) === true
  const recordInMinutes = sget(K_IN_MINUTES, true) !== false
  const panelSizeRaw = sget(K_PANEL_SIZE, 3)
  const panelSizeRequested = Number.isInteger(panelSizeRaw) && panelSizeRaw >= 1 ? panelSizeRaw : 3
  const panelSize = mode === 'panel' ? Math.max(2, panelSizeRequested) : 1
  const recuseWindowMs = nonNegInt(sget(K_RECUSE_WINDOW, 0), 0)
  const rationaleRequired = sget(K_RATIONALE, true) !== false
  const appealWindowMs = nonNegInt(sget(K_APPEAL_WINDOW, 0), 0)
  const hearingMinNotesSetting = nonNegInt(sget(K_HEARING_NOTES, 1), 1)
  const arbiterMustDiffer = sget(K_MUST_DIFFER, true) !== false
  const arbiterRuleRaw = sget(K_ARBITER_RULE, 'senior-slot')
  const arbiterRule = ARBITER_RULES.includes(arbiterRuleRaw) ? arbiterRuleRaw : 'senior-slot'
  const classesRaw = sget(K_CLASSES, null)
  // INTEGRATOR RULING (one knob, one name): the task's alternative spellings were removed, so only the
  // canonical key is read. Reading two names would force the gate to declare two knobs for one behaviour.
  const conflictClasses = Array.isArray(classesRaw) && classesRaw.length
    ? classesRaw.filter((x) => typeof x === 'string' && x)
    : ['fact', 'value', 'resource']
  const cooldownMs = nonNegInt(sget(K_COOLDOWN, 0), 0)
  const maxOpen = nonNegInt(sget(K_MAX_OPEN, 0), 0)
  const escalateMaxPerSubject = nonNegInt(sget(K_ESCALATE_MAX, 2), 2)
  const hearingNeedsMinutes = sget(K_HEARING_MINUTES, true) !== false
  const hearingMinNotes = Math.max(hearingMinNotesSetting, hearingNeedsMinutes ? 1 : 0)
  const appealToHuman = sget(K_APPEAL_HUMAN, true) !== false

  // ── state (mutated only by open/appoint/declareConflict/recuse/hear/rule/appeal/escalate) ───────────
  const cases = new Map()
  const order = []
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()      // counted wiring gaps (bus topics / minutes seam)
  const declaredTopics = new Set()
  const escalationsBySubject = new Map()
  let seq = 0

  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }
  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const caseOf = (id) => cases.get(id) || null

  /**
   * Named refusal helper: a refusal is COUNTED BY CODE before it is thrown.
   * D3 (round 26): the refusal also states its EVALUATION SCOPE — `enforcedScope:'evaluated-so-far'` says in
   * words that any key list travelling with a refusal is "what was consulted SO FAR", not the full key set.
   */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'arbitration/refused', at: now(), code, message, enforcedScope: ENFORCED_SCOPE })
    return Object.assign(refuse(code, message, hint), { enforcedScope: ENFORCED_SCOPE })
  }
  const record = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  /** Advisory hook: declare the topic when the bus supports it, else COUNT the wiring gap (never silent). */
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
    } catch (e) {
      bump(unwired, 'bus:' + hook, 1)
      say({ type: 'arbitration/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
    }
  }
  /** The minutes seam (vmu.arbitration.recordInMinutes): a missing/broken seam is a COUNTED wiring gap. */
  const toMinutes = (ruling) => {
    if (!recordInMinutes) return { recorded: false, why: 'vmu.arbitration.recordInMinutes=false' }
    const seam = minutes && (typeof minutes.append === 'function' ? minutes.append : (typeof minutes.record === 'function' ? minutes.record : null))
    if (!seam) { bump(unwired, 'minutes-seam', 1); return { recorded: false, why: 'no minutes seam is wired (counted as a wiring gap)' } }
    try {
      seam.call(minutes, { kind: 'arbitration-ruling', caseId: ruling.caseId, outcome: ruling.outcome, rationale: ruling.rationale, at: ruling.decidedAt })
      return { recorded: true }
    } catch (e) {
      bump(unwired, 'minutes-seam', 1)
      return { recorded: false, why: 'the minutes seam refused the ruling: ' + String((e && e.message) || e) }
    }
  }
  const requireEnabled = () => {
    if (!enabled) {
      throw deny('VMU_ARBITRATION_OFF', 'arbitration is off (vmu.arbitration.mode=' + mode + '): no case may be opened or moved',
        'set vmu.arbitration.mode to "single" or "panel" (zero mechanism = arbitration does not exist)')
    }
  }
  const requireCase = (id) => {
    const c = caseOf(id)
    if (!c) throw deny('VMU_NO_SUCH_OBJECT', 'unknown case: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
    return c
  }
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [])
  const openCases = () => order.map((id) => cases.get(id)).filter((c) => c && !FINAL_STATES.includes(c.state))
  const arbitersOf = (c) => c.arbiters.slice()
  const panelComplete = (c) => c.arbiters.length >= panelSize
  const implicating = (c) => (c.recuseRequired || []).filter((r) => c.arbiters.includes(r.arbiter))
  const lastDecisionAt = (subject) => {
    let at = null
    for (const id of order) { const c = cases.get(id); if (c && c.subject === subject && typeof c.decidedAt === 'number') at = at === null ? c.decidedAt : Math.max(at, c.decidedAt) }
    return at
  }
  const deterministicIndex = (seed, length) => {
    // A reproducible "random" (R12): no Math.random anywhere — the seed text decides, so two runs agree.
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
    return length > 0 ? Math.abs(h) % length : 0
  }
  const view = (c) => ({
    caseId: c.id, state: c.state, subject: c.subject, kind: c.kind, conflictClass: c.conflictClass,
    parties: c.parties.slice(), arbiters: c.arbiters.slice(), recused: c.recused.slice(),
    recuseRequired: (c.recuseRequired || []).map((r) => ({ arbiter: r.arbiter, withParty: r.withParty, since: r.since })),
    openedAt: c.openedAt, appointedAt: c.appointedAt, notes: c.notes.length, decidedAt: c.decidedAt,
    outcome: c.outcome, binding, escalations: c.escalations,
  })

  return {
    apiVersion,

    /** Open a conflict case. Parties are who is in conflict; the class routes the exit (docs/17 §7). */
    open({ parties, subject, kind = 'value', conflicts = null } = {}) {
      requireEnabled()
      const list = strList(parties)
      if (list.length !== (Array.isArray(parties) ? parties.length : 0) || list.length < 2) {
        throw deny('VMU_INVALID_ARGUMENT', 'open needs at least two distinct parties (non-empty strings)', 'e.g. { parties: ["alpha", "beta"], subject: "ownership of task t-3" }')
      }
      if (new Set(list).size !== list.length) throw deny('VMU_INVALID_ARGUMENT', 'the parties must be distinct: ' + list.join(', '), 'a case with a duplicated party is not a conflict')
      if (typeof subject !== 'string' || !subject.trim()) throw deny('VMU_INVALID_ARGUMENT', 'open needs a non-empty subject', 'the subject is how the cooldown is scoped')
      if (conflictClasses.length && !conflictClasses.includes(kind)) {
        throw deny('VMU_INVALID_ARGUMENT', 'unknown conflict kind: ' + String(kind), 'declared classes: ' + conflictClasses.join(', '))
      }
      if (maxOpen > 0 && openCases().length >= maxOpen) {
        throw deny('VMU_CONFLICT_LIMIT', 'too many open cases: ' + openCases().length + '/' + maxOpen + ' (vmu.conflict.maxOpen)', 'close or escalate a case first, or raise vmu.conflict.maxOpen')
      }
      if (cooldownMs > 0) {
        const last = lastDecisionAt(subject)
        if (last !== null && now() - last < cooldownMs) {
          throw deny('VMU_STATE', 'the conflict "' + subject + '" is in its cooldown: ' + (now() - last) + 'ms of ' + cooldownMs + 'ms elapsed since the last decision',
            'wait for the cooldown, or escalate to a human instead of re-opening the same conflict')
        }
      }
      const requireRecusal = []
      if (Array.isArray(conflicts)) {
        for (const c of conflicts) {
          if (!c || typeof c !== 'object') continue
          if (typeof c.arbiter === 'string' && typeof c.withParty === 'string') requireRecusal.push({ arbiter: c.arbiter, withParty: c.withParty, since: now() })
        }
      }
      const id = 'c-' + (++seq)
      const c = {
        id, subject: String(subject), kind: String(kind), conflictClass: String(kind),
        parties: list, arbiters: [], recused: [], recuseRequired: requireRecusal,
        state: 'open', openedAt: now(), appointedAt: null, notes: [], decidedAt: null, outcome: null,
        rationale: null, bindingAtDecision: binding, appealedAt: null, appealBy: null, appealReason: null,
        escalations: 0,
      }
      cases.set(id, c)
      order.push(id)
      record({ type: 'conflict/opened', caseId: id, parties: list, subject: c.subject, kind: c.kind })
      say({ type: 'conflict/opened', at: c.openedAt, caseId: id, parties: list, subject: c.subject })
      fire('conflict/opened', { caseId: id, parties: list })
      return { ok: true, caseId: id, state: c.state, openedAt: c.openedAt, parties: list, subject: c.subject, kind: c.kind, mustRecuse: requireRecusal.map((r) => r.arbiter) }
    },

    /** Appoint an arbiter. ESSENTIAL ①: a party (or an actor required to recuse) is refused BY NAME. */
    appoint({ caseId, arbiter } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof arbiter !== 'string' || !arbiter) throw deny('VMU_INVALID_ARGUMENT', 'appoint needs a non-empty `arbiter`', 'e.g. { caseId: "c-1", arbiter: "chair" }')
      if (FINAL_STATES.includes(c.state)) throw deny('VMU_STATE', 'case ' + c.id + ' is ' + c.state + ': no arbiter may be appointed', 'open a new case if the conflict continues')
      if (c.arbiters.includes(arbiter)) return { ok: true, caseId: c.id, arbiters: arbitersOf(c), panelComplete: panelComplete(c), unchanged: true }
      if (c.arbiters.length >= panelSize) throw deny('VMU_STATE', 'the panel for ' + c.id + ' is full: ' + c.arbiters.length + '/' + panelSize, 'raise vmu.arbitration.panelSize or use mode="single"')
      if (arbiterMustDiffer) {
        const asParty = c.parties.includes(arbiter)
        const mustRecuse = (c.recuseRequired || []).find((r) => r.arbiter === arbiter)
        if (asParty || mustRecuse) {
          const conflictsNamed = asParty
            ? 'party ' + arbiter
            : 'declared conflict with party ' + mustRecuse.withParty
          throw deny('VMU_ARBITER_IS_PARTY', 'arbiter "' + arbiter + '" may not judge case ' + c.id + ': it is a ' + conflictsNamed,
            'a party may not arbitrate its own case (vmu.conflict.arbiterMustDiffer=true) — appoint a third party, or have "' + arbiter + '" recuse first')
        }
      }
      c.arbiters.push(arbiter)
      c.appointedAt = now()
      c.state = 'appointed'
      record({ type: 'arbitration/appointed', caseId: c.id, arbiter, panel: arbitersOf(c) })
      say({ type: 'arbitration/appointed', at: c.appointedAt, caseId: c.id, arbiter })
      fire('arbitration/appointed', { caseId: c.id, arbiter })
      return { ok: true, caseId: c.id, arbiters: arbitersOf(c), panelSize, panelComplete: panelComplete(c), appointedAt: c.appointedAt }
    },

    /** Deterministic arbiter selection (`vmu.conflict.arbiterRule`). Never invents authority: `human` refuses. */
    pick({ caseId = null, candidates = [] } = {}) {
      const list = strList(candidates)
      if (list.length === 0) throw deny('VMU_ARBITER_UNAVAILABLE', 'pick needs at least one candidate arbiter', 'pass { candidates: ["a", "b"] }')
      const c = caseId === null ? null : requireCase(caseId)
      const eligible = list.filter((a) => {
        if (!c) return true
        if (c.arbiters.includes(a)) return false
        if (arbiterMustDiffer && (c.parties.includes(a) || (c.recuseRequired || []).some((r) => r.arbiter === a))) return false
        return true
      })
      if (eligible.length === 0) throw deny('VMU_ARBITER_UNAVAILABLE', 'no candidate may judge this case (all are parties or conflicted)', 'supply a third-party candidate, or have a candidate recuse and be replaced')
      if (arbiterRule === 'human') {
        throw deny('VMU_ARBITER_UNAVAILABLE', 'vmu.conflict.arbiterRule=human: a human must appoint the arbiter', 'the kernel does not pick for a human — appoint explicitly with appoint({ caseId, arbiter })')
      }
      let arbiter = eligible[0]
      if (arbiterRule === 'random') arbiter = eligible[deterministicIndex((c ? c.id : '') + '|' + c?.subject || '', eligible.length)]
      // senior-slot / mutual: the caller lists candidates in the order that rule implies (deterministic by design)
      record({ type: 'arbitration/picked', caseId: c ? c.id : null, arbiter, rule: arbiterRule })
      return { ok: true, arbiter, rule: arbiterRule, eligible, at: now(), note: 'selection is deterministic: no randomness is read (R12)' }
    },

    /** Declare that an arbiter is conflicted with a party ⇒ that arbiter must recuse inside the window. */
    declareConflict({ caseId, arbiter, withParty, reason = null } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof arbiter !== 'string' || !arbiter) throw deny('VMU_INVALID_ARGUMENT', 'declareConflict needs a non-empty `arbiter`', 'e.g. { caseId: "c-1", arbiter: "x", withParty: "alpha" }')
      if (typeof withParty !== 'string' || !withParty) throw deny('VMU_INVALID_ARGUMENT', 'declareConflict needs a non-empty `withParty`', 'name the party the arbiter is conflicted with')
      if (!c.parties.includes(withParty)) throw deny('VMU_NO_SUCH_OBJECT', 'not a party of ' + c.id + ': ' + withParty, 'parties: ' + c.parties.join(', '))
      if (c.recused.includes(arbiter)) return { ok: true, caseId: c.id, alreadyRecused: true }
      c.recuseRequired = (c.recuseRequired || []).filter((r) => r.arbiter !== arbiter)
      c.recuseRequired.push({ arbiter, withParty, since: now(), reason: reason === null ? null : String(reason) })
      const windowClosesAt = recuseWindowMs > 0 ? now() + recuseWindowMs : null
      record({ type: 'arbitration/conflict-declared', caseId: c.id, arbiter, withParty, windowClosesAt })
      say({ type: 'arbitration/conflict-declared', at: now(), caseId: c.id, arbiter, withParty })
      return { ok: true, caseId: c.id, arbiter, withParty, recuseWindowMs, windowClosesAt, mustRecurse: arbiterMustDiffer }
    },

    /** ESSENTIAL ④: recusal must happen inside the window, and it always needs a reason. */
    recuse({ caseId, arbiter, reason = null } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof arbiter !== 'string' || !arbiter) throw deny('VMU_INVALID_ARGUMENT', 'recuse needs a non-empty `arbiter`', 'e.g. { caseId: "c-1", arbiter: "x", reason: "mentor of alpha" }')
      if (typeof reason !== 'string' || !reason.trim()) {
        throw deny('VMU_REASON_REQUIRED', 'recusal must state its reason (S-4)', 'e.g. { caseId: "c-1", arbiter: "x", reason: "was the mentor of alpha" }')
      }
      const required = (c.recuseRequired || []).find((r) => r.arbiter === arbiter)
      if (required && recuseWindowMs > 0) {
        const closesAt = required.since + recuseWindowMs
        if (now() > closesAt) {
          throw deny('VMU_DUTY_CONFLICT', 'the recusal window for "' + arbiter + '" closed at ' + closesAt + 'ms (window ' + recuseWindowMs + 'ms from ' + required.since + 'ms): it may not be recused now',
            'a conflict must be declared and recused inside vmu.arbitration.recuseWindowMs — re-open the case with the conflict declared up front, or escalate to a human')
        }
      }
      if (!c.recused.includes(arbiter)) c.recused.push(arbiter)
      const removed = c.arbiters.includes(arbiter)
      c.arbiters = c.arbiters.filter((a) => a !== arbiter)
      if (removed && c.arbiters.length === 0) c.state = 'open'
      record({ type: 'arbitration/recused', caseId: c.id, arbiter, reason: String(reason), removed, windowMs: recuseWindowMs })
      say({ type: 'arbitration/recused', at: now(), caseId: c.id, arbiter, reason: String(reason) })
      fire('arbitration/recused', { caseId: c.id, arbiter })
      return { ok: true, caseId: c.id, arbiter, reason: String(reason), removedFromPanel: removed, arbiters: arbitersOf(c), mustReplace: removed, at: now() }
    },

    /** Record a hearing note. `hearingMinNotes` / `vmu.conflict.hearingNeedsMinutes` gate the ruling. */
    hear({ caseId, note, by = 'arbiter' } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof note !== 'string' || !note.trim()) throw deny('VMU_INVALID_ARGUMENT', 'hear needs a non-empty note', 'the note is the hearing record: docs/17 §6 (hearing)')
      if (c.arbiters.length === 0) throw deny('VMU_STATE', 'case ' + c.id + ' has no arbiter: appoint one before hearing', 'call appoint({ caseId, arbiter }) first')
      if (FINAL_STATES.includes(c.state)) throw deny('VMU_STATE', 'case ' + c.id + ' is ' + c.state + ': a hearing is closed', 'the ruling is final for this case; appeal instead')
      c.notes.push({ at: now(), by: String(by), note: String(note) })
      c.state = 'hearing'
      record({ type: 'arbitration/heard', caseId: c.id, by: String(by), notes: c.notes.length })
      return { ok: true, caseId: c.id, notes: c.notes.length, minNotes: hearingMinNotes, satisfied: c.notes.length >= hearingMinNotes, at: now() }
    },

    /** ESSENTIAL ②: a ruling MUST carry a rationale. ESSENTIAL ③: the effect is recorded as declared. */
    rule({ caseId, outcome, rationale = null } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof outcome !== 'string' || !outcome.trim()) throw deny('VMU_INVALID_ARGUMENT', 'rule needs a non-empty `outcome`', 'e.g. { caseId: "c-1", outcome: "t-3 belongs to alpha", rationale: "..." }')
      if (rationaleRequired && (typeof rationale !== 'string' || !rationale.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'a ruling must state its rationale (vmu.arbitration.rationaleRequired)',
          'set vmu.arbitration.rationaleRequired=false only if a bare outcome is acceptable — a number without a reason cannot be audited (docs/17 §6)')
      }
      if (!panelComplete(c)) {
        throw deny('VMU_STATE', 'case ' + c.id + ' has ' + c.arbiters.length + '/' + panelSize + ' arbiters: the panel is incomplete', 'appoint the remaining arbiters (mode=' + mode + '), or switch vmu.arbitration.mode')
      }
      if (implicating(c).length) {
        throw deny('VMU_ARBITER_IS_PARTY', 'case ' + c.id + ' still has conflicted arbiters on the panel: ' + implicating(c).map((r) => r.arbiter + ' (with ' + r.withParty + ')').join(', '),
          'each conflicted arbiter must recuse (inside vmu.arbitration.recuseWindowMs) before a ruling is possible')
      }
      if (c.notes.length < hearingMinNotes) {
        throw deny('VMU_STATE', 'case ' + c.id + ' has ' + c.notes.length + ' hearing note(s) but needs ' + hearingMinNotes, 'record the hearing with hear({ caseId, note, by }) first (vmu.arbitration.hearingMinNotes / vmu.conflict.hearingNeedsMinutes)')
      }
      if (FINAL_STATES.includes(c.state)) throw deny('VMU_STATE', 'case ' + c.id + ' is already ' + c.state, 'a ruling is final for this case; appeal instead of re-ruling')
      c.state = 'decided'
      c.decidedAt = now()
      c.outcome = String(outcome)
      c.rationale = rationale === null ? null : String(rationale)
      c.bindingAtDecision = binding
      const minutesResult = toMinutes({ caseId: c.id, outcome: c.outcome, rationale: c.rationale, decidedAt: c.decidedAt })
      record({ type: 'conflict/resolved', caseId: c.id, outcome: c.outcome, binding, inMinutes: minutesResult.recorded })
      say({ type: 'arbitration/ruled', at: c.decidedAt, caseId: c.id, outcome: c.outcome, binding })
      fire('conflict/resolved', { caseId: c.id, outcome: c.outcome, binding })
      return {
        ok: true, caseId: c.id, outcome: c.outcome, rationale: c.rationale, decidedAt: c.decidedAt,
        binding, effect: binding ? 'binding' : 'advisory', inMinutes: minutesResult.recorded, minutesNote: minutesResult.recorded ? null : minutesResult.why,
        panel: arbitersOf(c), notes: c.notes.length,
      }
    },

    /** Appeal a ruling. `appealToHuman=false` ⇒ refused by name; `appealWindowMs` closes the door. */
    appeal({ caseId, by, reason = null } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof by !== 'string' || !by) throw deny('VMU_INVALID_ARGUMENT', 'appeal needs a non-empty `by`', 'the appellant is audited (docs/17 §6/§19)')
      if (typeof reason !== 'string' || !reason.trim()) throw deny('VMU_REASON_REQUIRED', 'an appeal must state its reason (S-4)', 'say why the ruling should be reviewed')
      if (!appealToHuman) throw deny('VMU_NOT_PERMITTED', 'appeals to a human are disabled (vmu.conflict.appealToHuman=false)', 'set vmu.conflict.appealToHuman=true to allow human review')
      if (c.state !== 'decided') throw deny('VMU_STATE', 'case ' + c.id + ' is ' + c.state + ': only a decided case can be appealed', 'a ruling must exist first')
      if (appealWindowMs > 0 && c.decidedAt !== null && now() - c.decidedAt > appealWindowMs) {
        throw deny('VMU_STATE', 'the appeal window for ' + c.id + ' closed at ' + (c.decidedAt + appealWindowMs) + 'ms (window ' + appealWindowMs + 'ms)', 'a late appeal needs a human: escalate instead of appealing')
      }
      c.appealedAt = now(); c.appealBy = String(by); c.appealReason = String(reason)
      record({ type: 'arbitration/appealed', caseId: c.id, by: String(by), why: String(reason) })
      say({ type: 'arbitration/appealed', at: c.appealedAt, caseId: c.id, by: String(by) })
      fire('arbitration/appealed', { caseId: c.id, by: String(by) })
      return { ok: true, caseId: c.id, appealedAt: c.appealedAt, by: String(by), target: 'human', at: now() }
    },

    /** Escalate a case upward (counted per subject; only `escalateMaxPerSubject` escalations are allowed). */
    escalate({ caseId, to, reason = null } = {}) {
      requireEnabled()
      const c = requireCase(caseId)
      if (typeof to !== 'string' || !to.trim()) throw deny('VMU_CONFLICT_TARGET_UNKNOWN', 'escalate needs a non-empty target', 'e.g. { caseId: "c-1", to: "office", reason: "deadlock" }')
      if (typeof reason !== 'string' || !reason.trim()) throw deny('VMU_REASON_REQUIRED', 'an escalation must state its reason (S-4)', 'say why the case is going up')
      const used = escalationsBySubject.get(c.subject) || 0
      if (escalateMaxPerSubject > 0 && used >= escalateMaxPerSubject) {
        throw deny('VMU_CONFLICT_LIMIT', 'subject "' + c.subject + '" has been escalated ' + used + '/' + escalateMaxPerSubject + ' times (vmu.conflict.escalateMaxPerSubject)', 'the case must be decided or handed to a human; repeated escalation is not progress')
      }
      escalationsBySubject.set(c.subject, used + 1)
      c.escalations += 1
      record({ type: 'conflict/escalated', caseId: c.id, to: String(to), why: String(reason) })
      say({ type: 'conflict/escalated', at: now(), caseId: c.id, to: String(to), why: String(reason) })
      return { ok: true, caseId: c.id, to: String(to), escalations: c.escalations, subjectEscalations: used + 1, max: escalateMaxPerSubject, at: now() }
    },

    /** ESSENTIAL ③ (read-only): the effect of a ruling, stated explicitly — never a pretended enforcement. */
    effective({ caseId } = {}) {
      const c = requireCase(caseId)
      if (c.state !== 'decided' && c.state !== 'closed') {
        return {
          ok: true, caseId: c.id, state: c.state, decided: false, binding: null, effect: 'none',
          enforcement: 'none', appealed: false,
          note: 'no ruling exists yet: there is nothing to be effective',
        }
      }
      const isBinding = c.bindingAtDecision === true
      const baseNote = isBinding
        ? 'binding=true: the parties are bound by their own declaration — the kernel RECORDS the decision and does not execute it (vmu.arbitration.binding)'
        : 'binding=false: ADVISORY ONLY — nothing is enforced; the ruling is a recorded recommendation (vmu.arbitration.binding)'
      return {
        ok: true, caseId: c.id, state: c.state, decided: true,
        outcome: c.outcome, decidedAt: c.decidedAt, rationale: c.rationale,
        binding: isBinding,
        effect: isBinding ? 'binding' : 'advisory',
        enforcement: isBinding ? 'by-declaration' : 'none',
        appealed: c.appealedAt !== null, appealedAt: c.appealedAt, appealBy: c.appealBy,
        note: c.appealedAt !== null
          ? baseNote + ' — an appeal to a human is PENDING: the ruling keeps its declared effect until a human decides'
          : baseNote,
        at: now(),
      }
    },

    /** Read-only. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null, subject = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((id) => cases.get(id)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((c) => c.state === state)
      if (typeof subject === 'string' && subject) all = all.filter((c) => c.subject === subject)
      const kept = all.slice(0, cap).map(view)
      return { ok: true, cases: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: enabled }
    },

    /** Read-only: the audit trail (a capped ring; drops are counted). */
    history({ caseId = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => caseId === null || r.caseId === caseId)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** Read-only self-report. */
    status() {
      const all = order.map((id) => cases.get(id)).filter(Boolean)
      const decided = all.filter((c) => c.state === 'decided')
      return {
        ok: true,
        configured: enabled,
        mode, enabled, binding, recordInMinutes,
        panelSize, panelSizeRequested, recuseWindowMs, rationaleRequired, appealWindowMs,
        hearingMinNotes, arbiterMustDiffer, arbiterRule, conflictClasses, cooldownMs, maxOpen, escalateMaxPerSubject, appealToHuman,
        cases: {
          total: all.length, open: all.filter((c) => !FINAL_STATES.includes(c.state)).length,
          decided: decided.length, advisoryRulings: decided.filter((c) => c.bindingAtDecision !== true).length,
          bindingRulings: decided.filter((c) => c.bindingAtDecision === true).length,
          appealed: decided.filter((c) => c.appealedAt !== null).length,
        },
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        membersInjected: !!(members && typeof members.may === 'function'),
        minutesInjected: !!(minutes && (typeof minutes.append === 'function' || typeof minutes.record === 'function')),
        at: now(),
        note: 'arbitration records decisions; it never executes them — binding=false is advisory and says so (docs/17 §6)',
      }
    },
  }
}
