// vmu meeting — the meeting primitive (docs/08 §2).
//
// The kernel's job here is to be the MEDIUM and the bookkeeping, never the rulebook: who may convene,
// what "the round is complete" means, when a meeting may close - every one of those is a PLUGGABLE
// predicate with a conservative default, because the v5r line already paid for hard-coding one of them:
// `s8-freeze-say` (a refused, frozen utterance still counted towards "this round is done", the round
// never settled, retries were exhausted, and the meeting closed early).
//
// The invariants this module enforces:
//   · I-2 (docs/01 §3.1): nothing here advances a round implicitly. `roundComplete()` is ASKED, and a
//     refused input does not make a member "answered";
//   · A REFUSED INPUT IS NOT AN INPUT. `refuse()` records the refusal in history, leaves `inputs`
//     untouched, and keeps the member pending - so a refusal can never move the meeting towards "done";
//   · closing an incomplete round is REFUSED by name unless the caller forces it, and a forced close
//     leaves an auditable record saying who forced it and why;
//   · the wake/question seam is injected; without it the meeting refuses by name instead of pretending
//     it asked someone (docs/11 §4.1).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  return err
}

/** The conservative default: a round is complete only when every asked member is terminal. */
export function defaultRoundComplete({ asked, inputs, silent, refused }) {
  const pending = asked.filter((m) => !inputs[m] && !silent[m])
  if (pending.length > 0) {
    return { complete: false, reason: 'still waiting on ' + pending.join(','), pending: pending.slice() }
  }
  return { complete: true, reason: 'every asked member answered or stayed silent',
    refusedCount: asked.filter((m) => refused[m] && refused[m].length).length }
}

/** The conservative default roster check: at least two participants (the pack decides the real rule). */
export function defaultCanConvene({ roster }) {
  if (!Array.isArray(roster) || roster.length < 2) {
    return { ok: false, code: 'VMU_MEETING_TOO_SMALL', message: 'a meeting needs at least two participants' }
  }
  return { ok: true }
}

/**
 * Create a meeting. `deliver` is the ask seam; `roundComplete`, `canConvene`, `closePolicy` and
 * `handPolicy` are the pluggable decision points.
 */
// The instant normaliser is SHARED: `clock` is injected by the caller, and the kernel hands this module a NUMERIC
// clock, so `Date.parse(clock())` would be NaN and the round-timeout check below would silently stop working.
import { ms as toMs } from './timevalue.js'

export function createMeeting({
  id = null,
  kind = 'general',
  roster = [],
  canConvene = defaultCanConvene,
  roundComplete = defaultRoundComplete,
  closePolicy = () => ({ ok: true }),
  handPolicy = () => ({ ok: true }),
  deliver = null,
  bus = null,
  clock = () => new Date().toISOString(),
  // The three meeting controls (docs/04 §11) - each one a REAL consumer, not a declaration:
  // roundTimeoutMs = a round that ran too long refuses further input BY NAME;
  // quotesPerMessageMax = over the cap is REFUSED; quoteDepthMax = too deep is FOLDED AND COUNTED.
  roundTimeoutMs = 0,
  quotesPerMessageMax = 2,
  quoteDepthMax = 3,
  isPaused = () => false,
} = {}) {
  const state = { value: 'idle' }
  const history = []
  const rounds = []
  const quoteFolds = []
  const inputs = {}
  const silent = {}
  const refused = {}
  const hands = []
  let agenda = null
  let currentRound = null
  let asked = []
  let closedReason = null
// ROUND 87 (R10-2a, ported from the v5r line): the explicit end of a debate. `null` means "nobody said the debate
// is over", and aggregation is refused in that state - the sibling of I-2, which promises the same about ROUNDS.
let debateEnded = null
  let conveneRecord = null

  const record = (what, detail) => {
    const row = Object.assign({ at: clock(), what }, detail)
    history.push(row)
    return row
  }

  const meeting = {
    get state() { return state.value },
    get id() { return id },
    get kind() { return kind },
    get agenda() { return agenda },

    /** Convene: the roster and the agenda are checked by the pluggable `canConvene`. */
    async convene(agendaText, { roster: override } = {}) {
      if (state.value !== 'idle') throw refuse('VMU_STATE', 'this meeting was already convened', 'state=' + state.value)
      // A pause freezes the meeting's start too (docs/08 §5): control flow is not ledger-only.
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: this meeting cannot be convened',
        'resume() first (vibe_vmu_control {action:"resume"})')
      const useRoster = Array.isArray(override) ? override.slice() : roster.slice()
      const verdict = await canConvene({ roster: useRoster, kind, agenda: agendaText })
      if (!verdict || verdict.ok !== true) {
        record('convene-refused', { agenda: agendaText, code: verdict && verdict.code, reason: verdict && verdict.message })
        throw refuse((verdict && verdict.code) || 'VMU_NOT_PERMITTED',
          (verdict && verdict.message) || 'this meeting may not be convened',
          verdict && verdict.hint ? verdict.hint : undefined)
      }
      agenda = agendaText === undefined || agendaText === null ? null : String(agendaText)
      conveneRecord = { at: clock(), roster: useRoster, kind, agenda }
      state.value = 'convened'
      record('convened', { kind, agenda, roster: useRoster })
      return { ok: true, state: state.value, roster: useRoster }
    },

    /** Open a round: exactly the members the round will ask are fixed here, so completion is checkable. */
    async openRound({ ask = null, members = null } = {}) {
      if (state.value !== 'convened' && state.value !== 'in_session') {
        throw refuse('VMU_STATE', 'no round can start before the meeting is convened', 'state=' + state.value)
      }
      if (bus) {
        const dec = await bus.emit('meeting/round-start', { id, kind, agenda, round: rounds.length + 1 }, {})
        if (dec && dec.ok === false) {
          record('round-refused', { reason: 'middleware', entry: dec.entry })
          return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
        }
      }
      asked = (Array.isArray(members) ? members.slice() : (conveneRecord ? conveneRecord.roster.slice() : [])).filter(Boolean)
      if (asked.length === 0) throw refuse('VMU_MEETING_TOO_SMALL', 'a round needs at least one asked member')
      if (ask !== null && typeof deliver !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the round has a question but no ask seam is bound',
          'inject { deliver } - the kernel never calls the host itself (docs/11 §4.1)')
      }
      const round = { n: rounds.length + 1, asked: asked.slice(), ask: ask === null ? null : String(ask), openedAt: clock(),
        answers: {}, silent: [], refused: [] }
      rounds.push(round)
      currentRound = round
      // A new round is a NEW debate: an explicit end was about the previous one and does not carry over.
      debateEnded = null
      state.value = 'in_session'
      if (ask !== null && typeof deliver === 'function') {
        for (const member of asked) await deliver({ meeting: id, round: round.n, member, ask: round.ask, at: clock() })
      }
      record('round-opened', { round: round.n, asked: asked.slice(), ask: round.ask })
      return { ok: true, round: round.n, asked: asked.slice(), delivered: typeof deliver === 'function' && ask !== null }
    },

    /** An ACCEPTED input: only this can mark a member as answered (docs/08 §2.2). */
    async speak(member, text, { quotes = [] } = {}) {
      if (state.value !== 'in_session') throw refuse('VMU_STATE', 'no round is in session', 'state=' + state.value)
      if (!asked.includes(member)) throw refuse('VMU_NOT_PERMITTED', 'this member was not asked in the current round: ' + String(member))
      if (typeof text !== 'string' || text.trim().length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'an input needs non-empty text')
      // CONTROL FLOW (docs/08 §5): a pause freezes the meeting too, not only the task ledger.
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: ' + String(member) + ' cannot speak',
        'resume() first (vibe_vmu_control {action:"resume"})')
      // ROUND TIMEOUT (vmu.meetings.roundTimeoutMs; 0 = unlimited): the round's own openedAt is the datum.
      if (roundTimeoutMs > 0 && currentRound && currentRound.openedAt) {
        const elapsed = toMs(clock()) - toMs(currentRound.openedAt)
        if (Number.isFinite(elapsed) && elapsed > roundTimeoutMs) {
          record('input-refused', { round: currentRound.n, member, reason: 'round-timeout', elapsedMs: elapsed })
          throw refuse('VMU_STATE', 'round ' + currentRound.n + ' timed out ' + elapsed + 'ms after it opened (budget ' + roundTimeoutMs + 'ms)',
            'vmu.meetings.roundTimeoutMs is machine-enforced (docs/04 §11); close the round and open a new one')
        }
      }
      // QUOTE BUDGET (vmu.meetings.quotesPerMessageMax): over the cap is a NAMED refusal, as declared.
      const quoteList = Array.isArray(quotes) ? quotes : []
      if (quotesPerMessageMax > 0 && quoteList.length > quotesPerMessageMax) {
        record('input-refused', { round: currentRound.n, member, reason: 'quote-cap', quotes: quoteList.length, cap: quotesPerMessageMax })
        throw refuse('VMU_INVALID_ARGUMENT', 'per message at most ' + quotesPerMessageMax + ' quote(s), got ' + quoteList.length,
          'vmu.meetings.quotesPerMessageMax is machine-enforced (docs/04 §11)')
      }
      // QUOTE DEPTH (vmu.meetings.quoteDepthMax): too deep is FOLDED AND COUNTED, never a refusal (as declared).
      const folded = []
      const kept = quoteList.map((q) => {
        const depth = Number(q && q.depth) || 0
        if (quoteDepthMax > 0 && depth > quoteDepthMax) {
          folded.push({ id: (q && q.id) || null, depth, cap: quoteDepthMax })
          return Object.assign({}, q, { folded: true, depth })
        }
        return q
      })
      if (folded.length > 0) {
        record('quotes-folded', { round: currentRound.n, member, folded: folded.length, cap: quoteDepthMax })
        quoteFolds.push({ at: clock(), round: currentRound.n, member, folded: folded.slice() })
      }
      inputs[member] = text
      currentRound.answers[member] = { at: clock(), chars: text.length, quotes: kept.length, folded: folded.length }
      record('input-accepted', { round: currentRound.n, member, chars: text.length, quotes: kept.length, folded: folded.length })
      return { ok: true, member, round: currentRound.n, answered: asked.filter((m) => inputs[m]).length, of: asked.length,
        quotes: kept.length, folded: folded.length,
        foldingNotice: folded.length > 0 ? folded.length + ' quote(s) exceeded depth ' + quoteDepthMax + ' and were folded (counted below)' : null,
        quoteFolds: folded.slice() }
    },

    /**
     * A REFUSED input. It is recorded, it does NOT touch `inputs`, and it does NOT make the member
     * answered: this is the single line that keeps a refusal from advancing the meeting.
     */
    refuseInput(member, text, reason = 'refused') {
      if (state.value !== 'in_session') throw refuse('VMU_STATE', 'no round is in session', 'state=' + state.value)
      const row = record('input-refused', { round: currentRound.n, member, reason: String(reason), chars: String(text || '').length })
      refused[member] = (refused[member] || []).concat([{ at: row.at, reason: String(reason) }])
      currentRound.refused.push({ member, reason: String(reason) })
      return { ok: true, counted: false, member, reason: String(reason),
        stillPending: asked.filter((m) => !inputs[m] && !silent[m]) }
    },

    /** A member explicitly stays silent: that IS terminal, so a round can settle with silence. */
    markSilent(member, reason = 'no input') {
      if (state.value !== 'in_session') throw refuse('VMU_STATE', 'no round is in session')
      if (!asked.includes(member)) throw refuse('VMU_NOT_PERMITTED', 'this member was not asked in the current round')
      silent[member] = { at: clock(), reason: String(reason) }
      currentRound.silent.push(member)
      record('member-silent', { round: currentRound.n, member, reason: String(reason) })
      return { ok: true, member, terminal: true }
    },

    /** Raise a hand. The hand policy is pluggable; the default accepts. */
    handUp(member) {
      if (state.value !== 'in_session') throw refuse('VMU_STATE', 'no round is in session')
      if (!asked.includes(member)) throw refuse('VMU_NOT_PERMITTED', 'this member was not asked in the current round')
      const verdict = handPolicy({ member, round: currentRound.n, hands: hands.slice() })
      if (!verdict || verdict.ok !== true) {
        record('hand-refused', { round: currentRound.n, member, reason: verdict && verdict.message })
        return { ok: false, refused: { code: (verdict && verdict.code) || 'VMU_NOT_PERMITTED', message: (verdict && verdict.message) || 'hand refused' } }
      }
      hands.push({ member, round: currentRound.n, at: clock() })
      record('hand-up', { round: currentRound.n, member })
      return { ok: true, position: hands.length, member }
    },

    /** ASK the pluggable predicate. Never cached, never inferred (I-2). */
    roundComplete() {
      if (!currentRound) return { complete: false, reason: 'no round is open', pending: asked.slice() }
      const verdict = roundComplete({ asked: asked.slice(), inputs: Object.assign({}, inputs), silent: Object.assign({}, silent),
        refused: Object.assign({}, refused), round: currentRound.n, rounds: rounds.length })
      if (!verdict || typeof verdict.complete !== 'boolean') {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the roundComplete decision point must return { complete: boolean }')
      }
      return verdict
    },

    /**
     * END THE DEBATE explicitly (R10-2a, ported from the v5r line): aggregation may run only after someone SAYS
     * SO. This is the sibling of I-2 above - `roundComplete()` is ASKED and never inferred, and this makes the
     * same promise about AGGREGATION: no tally, no settlement and no conclusion may be derived while a debate is
     * open unless it was ended by name, with a reason. A second end is refused rather than absorbed, because an
     * explicit end is a FACT and not a repeatable action.
     */
    endDebate({ by = null, reason = null, target = null } = {}) {
      if (state.value === 'closed') throw refuse('VMU_STATE', 'the meeting is closed: the debate ended with it')
      if (debateEnded !== null) {
        throw refuse('VMU_STATE', 'the debate was already ended by ' + String(debateEnded.by === null ? '(unnamed)' : debateEnded.by),
          'open a new round instead of ending twice - an explicit end is recorded once')
      }
      if (typeof reason !== 'string' || !reason.trim()) {
        throw refuse('VMU_INVALID_ARGUMENT', 'endDebate needs a non-empty reason',
          'say WHY the debate ends: an unexplained end is the silent-stop failure mode this rule exists to prevent')
      }
      debateEnded = { by: by === null ? null : String(by), reason: String(reason),
        target: target === null ? null : String(target), at: clock() }
      record('debate-ended', debateEnded)
      return { ok: true, ended: true, by: debateEnded.by, reason: debateEnded.reason, target: debateEnded.target, at: debateEnded.at }
    },

    /**
     * ASK whether aggregation may run. The gate the v5r line needed: `allowed` is true ONLY after an explicit
     * `endDebate()`, and the answer carries its reason either way - never a silent yes.
     */
    aggregationAllowed() {
      if (debateEnded !== null) {
        return { allowed: true, reason: 'the debate was ended explicitly by ' + String(debateEnded.by === null ? '(unnamed)' : debateEnded.by), endedAt: debateEnded.at }
      }
      return { allowed: false, reason: currentRound ? 'a round is open and no explicit end was given' : 'no round was opened and no explicit end was given' }
    },

    /** Close the meeting. An incomplete round is refused unless forced, and a forced close is audited. */
    async close(reason = 'closed', { force = false, by = null } = {}) {
      if (state.value === 'closed') throw refuse('VMU_STATE', 'the meeting is already closed')
      const complete = currentRound ? meeting.roundComplete() : { complete: true, reason: 'no round was opened' }
      const policy = await closePolicy({ complete, round: currentRound ? currentRound.n : 0, reason })
      if (policy && policy.ok === false && !force) {
        record('close-refused', { reason: String(reason), policy: policy.message })
        throw refuse(policy.code || 'VMU_STATE', policy.message || 'the close policy refused to close', policy.hint)
      }
      if (!complete.complete && !force) {
        record('close-refused', { reason: String(reason), pending: complete.pending || [] })
        throw refuse('VMU_STATE', 'the round is not complete: ' + complete.reason,
          'finish the round, mark members silent, or force the close explicitly (force:true) - an early close is the s8-freeze-say failure mode')
      }
      if (!complete.complete && force) {
        record('close-forced', { reason: String(reason), by, pending: complete.pending || [] })
      }
      state.value = 'closed'
      closedReason = String(reason)
      if (bus) await bus.emit('meeting/round-end', { id, reason: closedReason, rounds: rounds.length }, {})
      record('closed', { reason: closedReason, forced: !complete.complete, by })
      return { ok: true, state: state.value, forced: !complete.complete, complete: complete.complete }
    },

    /** Structured minutes: what was asked, what came in, what was refused, and how it ended. */
    summary() {
      return {
        id, kind, state: state.value, agenda, roster: conveneRecord ? conveneRecord.roster.slice() : [],
        rounds: rounds.map((r) => ({ n: r.n, ask: r.ask, asked: r.asked.slice(), answered: Object.keys(r.answers).sort(),
          silent: r.silent.slice(), refused: r.refused.map((x) => ({ member: x.member, reason: x.reason })) })),
        inputs: Object.assign({}, inputs),
        unreached: asked.filter((m) => !inputs[m] && !silent[m]),
        hands: hands.map((h) => ({ member: h.member, round: h.round })),
        completeness: currentRound ? meeting.roundComplete() : null,
        closedReason,
      }
    },

    /** Observability (R11): the state machine plus the refusal-inclusive audit trail. */
    status() {
      return {
        id, kind, state: state.value, agenda, rounds: rounds.length,
        asked: asked.slice(),
        answered: Object.keys(inputs).length,
        silent: Object.keys(silent).length,
        refused: Object.values(refused).reduce((n, list) => n + list.length, 0),
        pending: asked.filter((m) => !inputs[m] && !silent[m]),
        hands: hands.length,
        hasDeliverSeam: typeof deliver === 'function',
        closedReason,
      }
    },

    history() { return history.map((h) => Object.assign({}, h)) },
  }

  return meeting
}
