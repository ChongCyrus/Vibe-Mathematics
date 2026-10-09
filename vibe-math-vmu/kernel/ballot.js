// vmu ballot — the voting primitive (docs/08 §3).
//
// A ballot is what a team uses to decide something, so the invariants here are the ones that decide
// whether the METHOD is sound rather than whether the meeting felt good:
//   · I-1 (docs/01 §3.1): a PROCESS reading is not a VERDICT. `kind: 'process'` entries are counted and
//     reported but can never produce a decision - the R10 invariant the v5r line learned the hard way;
//   · the outcome is THREE-valued (`true` / `false` / `undecided`) and `undecided` MUST carry a reason;
//   · A REFUSED CAST IS NOT A VOTE. A cast that fails a check is recorded in history WITH its reason and
//     leaves the tally untouched - the s8-freeze-say regression in v5r came from a refused action still
//     counting towards "the round is complete", which then closed the meeting early;
//   · every decision point is a PLUGGABLE predicate with a conservative default: who may open, who is
//     eligible, whether the ballot is frozen, whether a cast is valid, and how votes are tallied. The
//     kernel never encodes an institution's rule (R1, docs/08 §1).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Vote shapes the default validity check accepts: the boolean 1/0 of the m-vote rule. */
export const DECISIVE_VOTE = Object.freeze({ FOR: 1, AGAINST: 0 })

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  return err
}

/** The default tally: unanimous booleans decide, anything else stays undecided WITH a reason. */
export function defaultTally({ votes, eligible, quorumRule }) {
  const decisive = Object.values(votes).filter((v) => v && v.kind === 'decisive')
  if (decisive.length === 0) {
    return { outcome: 'undecided', reason: 'no decisive vote was cast', detail: { decisive: 0, eligible: eligible.length } }
  }
  if (eligible.length > 0 && decisive.length < eligible.length) {
    return { outcome: 'undecided', reason: 'not every eligible member has voted yet',
      detail: { voted: decisive.length, eligible: eligible.length } }
  }
  const allFor = decisive.every((v) => v.value === DECISIVE_VOTE.FOR)
  const allAgainst = decisive.every((v) => v.value === DECISIVE_VOTE.AGAINST)
  if (allFor) return { outcome: true, reason: 'unanimous for', detail: { rule: quorumRule, votes: decisive.length } }
  if (allAgainst) return { outcome: false, reason: 'unanimous against', detail: { rule: quorumRule, votes: decisive.length } }
  return { outcome: 'undecided', reason: 'votes are split', detail: { rule: quorumRule, votes: decisive.length } }
}

/**
 * Create a ballot. Every decision point may be replaced by a pack or a middleware; the defaults do the
 * least surprising thing and never invent a decision.
 */
export function createBallot({
  target = null,
  quorumRule = 'm-unanimous',
  eligible = [],
  canOpen = () => true,
  isEligible = (id) => eligible.length === 0 || eligible.includes(id),
  isFrozen = () => false,
  castValid = (id, value) => value === DECISIVE_VOTE.FOR || value === DECISIVE_VOTE.AGAINST,
  tally = defaultTally,
  bus = null,
  clock = () => new Date().toISOString(),
} = {}) {
  const votes = new Map()
  const history = []
  let state = 'closed'
  let frozen = false
  let outcome = null
  let openedAt = null
  let closedAt = null

  const record = (what, detail) => {
    const row = Object.assign({ at: clock(), what }, detail)
    history.push(row)
    return row
  }

  const ballot = {
    get state() { return state },
    get frozen() { return frozen },
    get target() { return target },

    /** Open the ballot. A refusal here does not change any state. */
    async open() {
      if (state === 'open' || state === 'frozen') {
        throw refuse('VMU_STATE', 'the ballot is already open', 'state=' + state)
      }
      const allowed = await canOpen({ target, eligible: eligible.slice(), quorumRule })
      if (allowed !== true) {
        record('open-refused', { target, reason: allowed && allowed.message ? allowed.message : 'canOpen said no' })
        throw refuse('VMU_NOT_PERMITTED', 'this ballot may not be opened',
          allowed && allowed.message ? allowed.message : 'the canOpen decision point refused')
      }
      state = 'open'
      frozen = false
      outcome = null
      openedAt = clock()
      record('opened', { target, quorumRule, eligible: eligible.slice() })
      return { ok: true, state, target }
    },

    /** Freeze: casts are refused BY NAME and, crucially, are NOT recorded as votes (docs/08 §3.1). */
    async freeze(reason = 'frozen') {
      if (state !== 'open' && state !== 'frozen') throw refuse('VMU_STATE', 'only an open ballot can be frozen')
      frozen = true
      state = 'frozen'
      record('frozen', { reason: String(reason) })
      return { ok: true, frozen: true, reason: String(reason) }
    },

    async unfreeze(reason = 'unfrozen') {
      if (state !== 'frozen') throw refuse('VMU_STATE', 'the ballot is not frozen')
      frozen = false
      state = 'open'
      record('unfrozen', { reason: String(reason) })
      return { ok: true, frozen: false }
    },

    /**
     * Cast a vote. Returns { ok: true, accepted: true } when the vote counts, or a NAMED refusal whose
     * record in history explains what was refused - and which never enters the tally.
     */
    async cast(member, value, { kind = 'decisive' } = {}) {
      if (state !== 'open' && state !== 'frozen') {
        record('cast-refused', { member, reason: 'ballot is not open', state })
        throw refuse('VMU_STATE', 'the ballot is not open', 'state=' + state)
      }
      if (bus) {
        const dec = await bus.emit('ballot/cast', { target, member, value, kind }, { member })
        if (dec && dec.ok === false) {
          record('cast-refused', { member, reason: 'middleware', entry: dec.entry })
          return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
        }
      }
      // Frozen means "cast refused, nothing counted" - the policy decides when to freeze.
      if (frozen || isFrozen({ member, target })) {
        record('cast-refused', { member, value, reason: 'in-frozen-ballot' })
        throw refuse('VMU_STATE', 'the ballot is frozen: the cast was refused and is NOT counted',
          'unfreeze before casting (docs/08 §3.1)')
      }
      if (!isEligible(member)) {
        record('cast-refused', { member, reason: 'not-eligible' })
        throw refuse('VMU_NOT_PERMITTED', 'not eligible to vote in this ballot: ' + String(member))
      }
      if (votes.has(member)) {
        record('cast-refused', { member, reason: 'duplicate' })
        throw refuse('VMU_STATE', 'this member already voted: ' + String(member), 'one vote per member per ballot')
      }
      if (kind === 'decisive' && !castValid(member, value)) {
        record('cast-refused', { member, value, reason: 'invalid-value' })
        throw refuse('VMU_INVALID_ARGUMENT', 'a decisive vote must be the boolean 1 or 0',
          'got ' + JSON.stringify(value) + ' (the m-vote rule)')
      }
      votes.set(member, { value, kind, at: clock() })
      record('cast', { member, value, kind })
      return { ok: true, accepted: true, member, value, kind, votes: votes.size }
    },

    /**
     * Close and settle. `undecided` always carries a reason; a custom tally can replace the rule but can
     * never remove the three-valued contract.
     */
    async close(reason = 'closed') {
      if (state !== 'open' && state !== 'frozen') throw refuse('VMU_STATE', 'the ballot is not open')
      const voteObject = Object.fromEntries([...votes.entries()].map(([k, v]) => [k, v]))
      let result
      if (bus) {
        const dec = await bus.emit('ballot/tally', { target, votes: voteObject, eligible: eligible.slice(), quorumRule }, {})
        const override = dec && dec.ok && dec.decisions.find((d) => d.decision && d.decision.tally)
        result = override ? override.decision.tally : tally({ votes: voteObject, eligible: eligible.slice(), quorumRule })
      } else {
        result = tally({ votes: voteObject, eligible: eligible.slice(), quorumRule })
      }
      if (!result || !('outcome' in result)) {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the tally decision point returned no outcome',
          'a tally must return { outcome, reason?, detail? }')
      }
      if (result.outcome === 'undecided' && !result.reason) {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'an undecided outcome MUST carry a reason (docs/08 §3.2)')
      }
      state = 'tallied'
      frozen = false
      outcome = { outcome: result.outcome, reason: result.reason || null, detail: result.detail || null, at: clock() }
      closedAt = clock()
      record('closed', { reason: String(reason), outcome: outcome.outcome, tallyReason: outcome.reason })
      return { ok: true, state, outcome: outcome.outcome, tally: outcome }
    },

    /** Reopen a settled ballot. The previous outcome stays in history (nothing is overwritten). */
    async reopen(reason = 'reconsidered') {
      if (state !== 'tallied') throw refuse('VMU_STATE', 'only a tallied ballot can be reopened')
      record('reopened', { reason: String(reason), previous: outcome ? outcome.outcome : null })
      state = 'open'
      outcome = null
      votes.clear()
      return { ok: true, state, reason: String(reason) }
    },

    /** Observability (R11): the votes as counted, the tally state, and the full refusal-inclusive history. */
    status() {
      const byKind = { decisive: 0, process: 0 }
      for (const v of votes.values()) byKind[v.kind] = (byKind[v.kind] || 0) + 1
      return {
        target, state, frozen, quorumRule,
        eligible: eligible.slice(),
        votes: Object.fromEntries([...votes.entries()].map(([k, v]) => [k, { value: v.value, kind: v.kind }])),
        voteCount: votes.size,
        byKind,
        outcome: outcome ? Object.assign({}, outcome) : null,
        refused: history.filter((h) => h.what === 'cast-refused' || h.what === 'open-refused').map((h) => Object.assign({}, h)),
        openedAt, closedAt,
      }
    },

    /** The full history, including refusals: what was refused is as auditable as what was accepted. */
    history() { return history.map((h) => Object.assign({}, h)) },

    /** Process readings never decide (I-1). Exposed so a caller can see the separation explicitly. */
    processReadings() {
      return [...votes.values()].filter((v) => v.kind === 'process').map((v) => ({ value: v.value, at: v.at }))
    },
  }

  return ballot
}
