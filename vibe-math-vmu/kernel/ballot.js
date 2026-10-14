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
import { CODE as RESUME_CODE } from './resume.js'

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
 * ROUND 157 — INSTANT-RUNOFF (IRV) TALLY. The last confirmed gap, implemented BESIDE `defaultTally` because that is
 * the single tally source and the ballot already takes its tally as an injected seam - so a face selects this one
 * without the kernel changing shape.
 *
 * A voter's `value` is a RANKED LIST of option ids, best first. Each rule below is a decision, so each is stated:
 *   · a strict majority of the CONTINUING ballots elects immediately;
 *   · otherwise the option with the fewest first preferences is eliminated and those ballots transfer to their next
 *     surviving choice - the defining property of IRV, and why the result must carry every ROUND, not just a winner;
 *   · an EXHAUSTED ballot (every ranked option eliminated) stops counting, and the count is REPORTED, because a
 *     silent drop would change who wins;
 *   · a tie for elimination is NOT broken here: the result is `undecided` with the tied options NAMED (the pack's
 *     tie rule decides - never an implicit sort order ✗).
 */
export function instantRunoffTally({ votes, eligible, quorumRule } = {}) {
  const ballots = Object.entries(votes || {})
    .filter(([, v]) => v && v.kind === 'decisive')
    .map(([who, v]) => ({ who, ranking: (Array.isArray(v.value) ? v.value : [v.value]).map(String).filter((x) => x.trim() !== '') }))
    .filter((b) => b.ranking.length > 0)
  const alive = new Set()
  for (const b of ballots) for (const c of b.ranking) alive.add(c)
  const rounds = []
  const base = { rule: quorumRule, ballots: ballots.length, eligible: (eligible || []).length }
  if (!alive.size) return { outcome: 'undecided', reason: 'no ranked ballot carried any option', detail: Object.assign({}, base, { rounds, exhausted: 0, elected: null, tie: [] }) }
  for (;;) {
    const firstChoice = ballots.map((b) => b.ranking.find((c) => alive.has(c)) || null)
    const continuing = firstChoice.filter((c) => c !== null)
    const exhausted = firstChoice.length - continuing.length
    const counts = {}
    for (const c of continuing) counts[c] = (counts[c] || 0) + 1
    const aliveSorted = [...alive].sort()
    rounds.push({ round: rounds.length + 1, alive: aliveSorted, counts: Object.assign({}, counts), counted: continuing.length, exhausted })
    if (!continuing.length) return { outcome: 'undecided', reason: 'every ballot was exhausted', detail: Object.assign({}, base, { rounds, exhausted, elected: null, tie: [] }) }
    const leader = aliveSorted.filter((c) => counts[c] !== undefined).sort((x, y) => (counts[y] || 0) - (counts[x] || 0))[0]
    if (counts[leader] * 2 > continuing.length) {
      return { outcome: leader, reason: 'strict majority of the continuing ballots', detail: Object.assign({}, base, { rounds, exhausted, elected: leader, tie: [] }) }
    }
    const rankedAlive = aliveSorted.map((c) => ({ c, n: counts[c] || 0 })).sort((x, y) => x.n - y.n)
    const lowest = rankedAlive.filter((r) => r.n === rankedAlive[0].n).map((r) => r.c)
    if (lowest.length !== 1) {
      // A tie for LAST place is not resolved here: the pack's tie rule owns that decision, and the tied set is named.
      return { outcome: 'undecided', reason: 'tie for elimination', detail: Object.assign({}, base, { rounds, exhausted, elected: null, tie: lowest }) }
    }
    alive.delete(lowest[0])
  }
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
  isPaused = () => false,
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
      // A pause freezes new ballots (docs/08 §5): the ledger is not the only thing control flow gates.
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: no ballot can be opened',
        'resume() first (vibe_vmu_control {action:"resume"})')
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
      // A pause also freezes CASTING: a ballot whose voters can keep voting is not frozen at all (§5).
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: this ballot cannot be voted in',
        'resume() first (vibe_vmu_control {action:"resume"})')
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

    /**
     * PERSISTENCE SEAM v1 (kernel/resume.js interface). JSON-safe state, the id counter at max+1 (the ballot
     * has no minted id of its own — the caller names it — so the counter is reported as 0 unless a `target`
     * carries a suffix), and the injected seams NAMED as skipped rather than silently absent.
     */
    snapshot() {
      return { apiVersion, face: 'ballot', v: 1, at: clock(),
        data: { target, quorumRule, eligible: eligible.slice(), frozen, state, outcome: outcome ? JSON.parse(JSON.stringify(outcome)) : null,
          openedAt, closedAt, votes: Object.fromEntries([...votes.entries()].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])),
          history: history.map((h) => JSON.parse(JSON.stringify(h))) },
        counters: { ballot: (/(\d+)\s*$/.exec(String(target || '')) || [])[1] ? Number(/(\d+)\s*$/.exec(String(target))[1]) : 0 },
        skipped: [{ what: 'bus', why: 'an injected bus is re-bound by the host, never serialised' },
          { what: 'decision-points', why: 'canOpen/isEligible/isFrozen/castValid/tally are injected predicates, re-bound by the host' }] }
    },

    /** Hydrate a `snapshot()`. Idle-safe merge, idempotent on the same snapshot, named conflict otherwise. */
    restore(snap) {
      if (!snap || typeof snap !== 'object') return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'no snapshot to restore', missing: ['snapshot'] }
      if (snap.face !== 'ballot') return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'not a ballot snapshot (face=' + String(snap.face) + ')' }
      if (Number(snap.v) !== 1) return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'unsupported snapshot version ' + String(snap.v) }
      const d = snap.data
      const missing = ['state', 'votes'].filter((k) => !d || d[k] === undefined)
      if (missing.length) return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'snapshot is missing ' + missing.join(', '), missing }
      const same = JSON.stringify(d) === JSON.stringify(ballot.snapshot().data)
      if (!same && votes.size > 0) {
        return { ok: false, restored: false, code: RESUME_CODE.restoreConflict,
          message: 'this ballot already holds ' + votes.size + ' live vote(s): refusing to half-overwrite it',
          hint: 'use a fresh ballot instance, or restore the snapshot that matches the live state' }
      }
      state = String(d.state)
      frozen = !!d.frozen
      outcome = d.outcome ? JSON.parse(JSON.stringify(d.outcome)) : null
      openedAt = d.openedAt === undefined ? null : d.openedAt
      closedAt = d.closedAt === undefined ? null : d.closedAt
      votes.clear()
      for (const [k, v] of Object.entries(d.votes || {})) votes.set(k, JSON.parse(JSON.stringify(v)))
      history.length = 0
      for (const h of (d.history || [])) history.push(JSON.parse(JSON.stringify(h)))
      return { ok: true, restored: true, restored_items: ['state', 'votes', 'history', 'outcome'], counters: { ballot: 0 }, skipped: (snap.skipped || []).slice(), state }
    },

    /** Process readings never decide (I-1). Exposed so a caller can see the separation explicitly. */
    processReadings() {
      return [...votes.values()].filter((v) => v.kind === 'process').map((v) => ({ value: v.value, at: v.at }))
    },
  }

  return ballot
}
