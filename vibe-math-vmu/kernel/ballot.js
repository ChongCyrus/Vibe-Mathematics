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
import { msStrict } from './timevalue.js'

/** Vote shapes the default validity check accepts: the boolean 1/0 of the m-vote rule. */
export const DECISIVE_VOTE = Object.freeze({ FOR: 1, AGAINST: 0 })

/**
 * F26 — THE FIVE VOTE KINDS, as a FIXED enum.
 *
 * WHAT WAS MISSING. This face let the SEPARATION of vote kinds be an artefact of settings (`abstainAllowed`,
 * `abstainCountsForFloor`, `recusePublic`, `vetoMode`, `tieRule`): each cast carried a free-form `kind`, but
 * "which of the kinds IS this cast?" had no single, fixed answer, so two deployments could classify the same
 * ballot differently and neither could point at a vocabulary. `classifyVote` is that single answer, and every
 * stored ballot now carries exactly one of these five:
 *   · `for` / `against`      — the decisive booleans (1 / 0), the only kinds that can settle an m-vote;
 *   · `abstain`              — an explicit abstention (also what C-45's enforced rewrite produces);
 *   · `unable`               — the member cannot judge (v5r's distinct state; NOT a quiet `against`);
 *   · `estimate`             — a probability strictly between 0 and 1 (v5r: counted for the average, never for m).
 * `process` is deliberately NOT a sixth kind: a process READING is not a vote at all (I-1 / F27) and stays its
 * own channel, so it can never be confused with "someone voted something".
 */
export const VOTE_KINDS = Object.freeze(['for', 'against', 'abstain', 'unable', 'estimate'])

/** Classify one cast into exactly ONE of the five kinds (or `process`, or null when it is none of them). PURE. */
export function classifyVote(value, kind = 'decisive') {
  if (kind === 'process') return 'process'
  if (kind === 'abstain') return 'abstain'
  if (kind === 'unable') return 'unable'
  if (kind === 'estimate') {
    // An estimate must be DECLARED (`{ kind: 'estimate' }`) and must be strictly between the booleans: a sloppy
    // `0.4` sent as a decisive vote keeps failing the m-vote rule rather than being silently reclassified.
    const e = Number(value)
    return Number.isFinite(e) && e > 0 && e < 1 ? 'estimate' : null
  }
  if (value === DECISIVE_VOTE.FOR) return 'for'
  if (value === DECISIVE_VOTE.AGAINST) return 'against'
  return null
}

/** The kinds that may settle an m-vote (everything else is recorded, reported, and never decisive). */
export const DECISIVE_KINDS = Object.freeze(['for', 'against', 'decisive'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  return err
}

/** The default tally: unanimous booleans decide, anything else stays undecided WITH a reason. */
export function defaultTally({ votes, eligible, quorumRule }) {
  // F26: the decisive set is defined by the FIXED kind vocabulary (`for`/`against`), with the legacy `decisive`
  // label still honoured so a snapshot written before the vocabulary existed restores to the same tally.
  const decisive = Object.values(votes).filter((v) => v && DECISIVE_KINDS.indexOf(v.kind) !== -1)
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
 * F31+（Round 6）— THE DURABLE COMMIT LOG: the queue-type seam that makes a commit atomic ACROSS PROCESSES.
 *
 * Round 5 gave this face an IN-PROCESS FIFO gate (two concurrent casts cannot interleave). That is not enough for
 * "high-freedom, tunable infrastructure": if the process dies between INTENT and APPLY, or two processes write to
 * the same institution, the in-process chain knows nothing. This seam closes both, with an honest contract:
 *
 *   · THE STORE ALLOCATES THE TICKET. `store.append(record)` must return `{ ticket }` (an O_APPEND file, a SQLite
 *     sequence, a locked journal — whatever the host uses). Two processes sharing that store therefore get
 *     DISTINCT, monotonic tickets; only when the store does not answer with one does a local counter step in (and
 *     then the seam says so: its numbering is per-process).
 *   · INTENT IS WRITTEN BEFORE THE EFFECT. `reserve()` appends the intent and only then does the caller apply it;
 *     `complete()` appends the outcome. A crash between the two leaves the intent in the log — exactly what
 *     `recover()` looks for.
 *   · RECOVERY NEVER DOUBLE-APPLIES. An intent whose ticket is already marked done is skipped; the ballot's
 *     `reconcile()` replays the rest in ticket order and is idempotent (a member's vote is unique by construction).
 *   · NO STORE ⇒ `durable:false` BY NAME and `reserve()` returns null: the seam is ABSENT, never pretended.
 */
export function createDurableCommitLog({ store = null, clock = () => Date.now(), name = 'ballot' } = {}) {
  const durable = !!(store && typeof store.append === 'function' && typeof store.readAll === 'function')
  let tickets = 0
  let appended = 0
  let recoveredAt = null
  const done = new Set()

  const status = () => ({ durable, name, tickets, appended, done: done.size, recoveredAt,
    numbering: 'store-allocated when the store answers with a ticket, otherwise local (per-process)' })

  /** Read the log back: the ticket counter must never go BACKWARDS, and a done record must never replay. */
  const recover = () => {
    if (!durable) return { ok: true, durable: false, tickets: 0, pending: [],
      reason: 'no durable store is bound: the seam is absent, not pretended' }
    const recs = (store.readAll() || []).filter((r) => r && Number.isFinite(Number(r.ticket)))
    for (const r of recs) if (r.done === true) done.add(Number(r.ticket))
    // An intent is pending ONLY if its own ticket is not marked done — a completed commit leaves two rows (the
    // intent and its outcome), and counting the intent again would replay every finished vote after a restart.
    const pending = recs.filter((r) => r.done !== true && !done.has(Number(r.ticket))).sort((a, b) => Number(a.ticket) - Number(b.ticket))
    tickets = recs.reduce((m, r) => Math.max(m, Number(r.ticket)), 0)
    recoveredAt = clock()
    return { ok: true, durable: true, tickets, pending,
      reason: pending.length ? 'unfinished commits were found in the durable log' : 'the durable log is settled' }
  }

  /** Write the INTENT (before the effect): the returned record carries its ticket, or null without a store. */
  const reserve = (op) => {
    if (!durable) return null
    const rec = { ticket: null, at: clock(), name, op }
    const assigned = store.append(rec)
    const t = assigned && Number.isFinite(Number(assigned.ticket)) ? Number(assigned.ticket) : tickets + 1
    rec.ticket = t
    tickets = Math.max(tickets, t)
    appended += 1
    return rec
  }

  /** Write the OUTCOME (after the effect): this is what makes recovery skip a finished commit. */
  const complete = (rec, outcome = 'applied') => {
    if (!durable || !rec) return null
    done.add(Number(rec.ticket))
    store.append({ ticket: rec.ticket, at: clock(), name, done: true, outcome })
    return rec.ticket
  }

  recover()
  return { status, recover, reserve, complete, durable }
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
  // C-45 (L2 option A): the fidelity registry (`kernel/fidelity.js`). Injected because the DECISION lives there;
  // this face only routes a decisive cast through it (the single enforcement point, see `cast` below).
  fidelity = null,
  // F32 (the "just decided" window): a SECOND settlement carrying the SAME outcome inside this window is folded
  // into the previous one instead of being announced twice. 0 = off (zero mechanism, the default).
  dedupWindowMs = 0,
  // F34 (who may open a debate, and over what): `openers` names the members allowed to open (null = anyone),
  // `minEligible` is the smallest electorate that may be convened (0 = no minimum), and `requiresTarget` makes a
  // targetless debate unopenable. All three are DECLARED here and reported by `status().openCriterion`.
  openers = null,
  minEligible = 0,
  requiresTarget = false,
  // F31+ (Round 6): the durable commit log (`createDurableCommitLog`). Injected because the STORE is the host's;
  // this face supplies the protocol. Absent ⇒ `status().gate.durable === false`, named rather than assumed.
  durableQueue = null,
  // ROUND 8 / task-58 (G6): THE ALLOCATING STORE, one level lower than `durableQueue`. The host owns a store whose
  // `append(record)` answers `{ ticket }` (an O_APPEND file, a SQLite sequence, a locked journal); when one is handed
  // in, THIS face builds the commit log from it (`createDurableCommitLog`), so the protocol is the face's and the
  // numbering is the host's. An explicit `durableQueue` still wins (back-compat), and a function is resolved AT CALL
  // TIME (a plugin's `apply` can run before the host service mounts). No store ⇒ `durable:false` BY NAME, never
  // pretended.
  commitStore = null,
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
  // F31: the explicit commit gate (one FIFO chain per ballot) and its observable depth.
  let gate = Promise.resolve()
  let gatePending = 0
  let gateCommits = 0
  // F32: the previous settlement, so a duplicate inside the window can be folded.
  let lastClose = null
  let dedupedVerdicts = 0
  const dedupMs = Number.isFinite(Number(dedupWindowMs)) && Number(dedupWindowMs) > 0 ? Math.floor(Number(dedupWindowMs)) : 0
  const openerList = Array.isArray(openers) ? openers.map((x) => String(x)) : null
  const minElectorate = Number.isFinite(Number(minEligible)) && Number(minEligible) > 0 ? Math.floor(Number(minEligible)) : 0

  const record = (what, detail) => {
    const row = Object.assign({ at: clock(), what }, detail)
    history.push(row)
    return row
  }

  // ROUND 8 / task-58 (G6): resolve the allocating store AT CALL TIME and build the one commit log this ballot uses.
  // `durableQueue` (an already-built log) still takes precedence, so every existing caller keeps its exact behaviour.
  const resolvedCommitStore = (() => {
    try { return typeof commitStore === 'function' ? commitStore() : commitStore } catch (e) { record('commit-store-failed', { code: 'VMU_COMMIT_STORE_FAILED', message: String((e && e.message) || e) }); return null }
  })()
  const queue = durableQueue || createDurableCommitLog({ store: resolvedCommitStore, clock, name: 'ballot' })

  /**
   * The cast BODY (the critical section the gate below serializes). Kept as a closure so the public `cast` can be
   * a one-line gated wrapper: the body must never be reachable without the gate.
   */
  const castNow = async (member, value, { kind = 'decisive' } = {}) => {
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
    // F26: every stored ballot carries EXACTLY ONE of the five fixed kinds — never a free-form label.
    const voteKind = classifyVote(value, kind)
    if (voteKind === null) {
      record('cast-refused', { member, value, kind, reason: 'unclassifiable' })
      throw refuse('VMU_INVALID_ARGUMENT', 'a cast must be one of the declared kinds: ' + VOTE_KINDS.join('/') + ' (or a process reading)',
        'got ' + JSON.stringify(value) + ' as ' + JSON.stringify(kind) + ' — 1/0 are for/against, a number strictly between them is an estimate, and abstain/unable/process are named kinds')
    }
    /**
     * C-45 — THE SINGLE FIDELITY ENFORCEMENT POINT (v5r L2 option A / Adv-verify F1). A member who DECLARED a
     * fidelity defect on this object cannot assert 1 or 0 on it: the registry (`kernel/fidelity.js`) rewrites
     * the ballot to 0.5 AND the rewrite is a first-class ABSTENTION here (`kind:'abstain'`, so it is excluded
     * from the decisive count exactly as an abstention is), while the declared value and the marker id are
     * kept for the audit. Nothing is silent: the receipt says `byFidelity`, the row keeps `declared`, and the
     * registry's own trail/bus event names the marker.
     */
    let stored = { value, kind: voteKind, at: clock() }
    if (fidelity && kind === 'decisive' && typeof fidelity.applyAbstention === 'function') {
      const enforce = fidelity.applyAbstention({ target, by: member, declared: value })
      if (enforce && enforce.enforced === true) {
        stored = { value: enforce.vote, kind: 'abstain', at: clock(), declared: value,
          byFidelity: true, markerId: enforce.marker === undefined ? null : enforce.marker, reason: enforce.reason || 'fidelity-defect' }
      }
    }
    votes.set(member, stored)
    record('cast', { member, value: stored.value, kind: stored.kind, declared: value, byFidelity: !!stored.byFidelity })
    return { ok: true, accepted: true, member, value: stored.value, voteKind: stored.kind, declared: value, kind: stored.kind,
      byFidelity: !!stored.byFidelity, markerId: stored.markerId || null, votes: votes.size,
      note: stored.byFidelity ? 'the declared value was rewritten to an abstention by C-45 (declared fidelity defect)' : undefined }
  }

  const ballot = {
    get state() { return state },
    get frozen() { return frozen },
    get target() { return target },

    /** Open the ballot. A refusal here does not change any state. */
    async open({ by = null } = {}) {
      // A pause freezes new ballots (docs/08 §5): the ledger is not the only thing control flow gates.
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: no ballot can be opened',
        'resume() first (vibe_vmu_control {action:"resume"})')
      if (state === 'open' || state === 'frozen') {
        throw refuse('VMU_STATE', 'the ballot is already open', 'state=' + state)
      }
      // A SETTLED ballot is reopened (`reopen()`), never re-opened: `open()` keeps the previous votes, so the next
      // cast would be refused as a duplicate while the old tally silently stayed in place. Named here instead.
      if (state === 'tallied') {
        record('open-refused', { target, by, reason: 'already-settled', previous: outcome ? outcome.outcome : null })
        throw refuse('VMU_STATE', 'this ballot was already settled: re-opening would keep the previous votes',
          'call reopen() to clear the votes and debate again, or start a fresh ballot')
      }
      /**
       * F34 — THE OPENING CRITERION, enforced where a debate STARTS (the evidence's gap: this face judged who may
       * VOTE but never who may CONVENE). Three declared conditions, each refused by name and recorded in history:
       *   · `openers`      — null = anyone; an array names the members who may open;
       *   · `minEligible`  — > 0 = the smallest electorate that may be convened (0 = no minimum);
       *   · `requiresTarget` — a targetless debate can settle nothing, so it cannot start.
       * `status().openCriterion` reports the same shape, so the criterion is observable before anyone hits it.
       */
      if (openerList && openerList.indexOf(String(by)) === -1) {
        record('open-refused', { target, by, reason: 'not-an-opener' })
        throw refuse('VMU_NOT_PERMITTED', 'this member may not OPEN this debate: ' + String(by),
          'opening is a gate: the declared openers are ' + openerList.join(', '))
      }
      if (requiresTarget === true && !target) {
        record('open-refused', { target, by, reason: 'no-target' })
        throw refuse('VMU_INVALID_ARGUMENT', 'this debate may not be opened without a TARGET',
          'a targetless debate cannot settle anything, so it cannot start (requiresTarget)')
      }
      if (minElectorate > 0 && eligible.length < minElectorate) {
        record('open-refused', { target, by, reason: 'electorate-too-small', eligible: eligible.length, minEligible: minElectorate })
        throw refuse('VMU_STATE', 'the electorate is too small to convene this debate: ' + eligible.length + ' / ' + minElectorate,
          'declare at least ' + minElectorate + ' eligible voters (minEligible)')
      }
      const allowed = await canOpen({ target, eligible: eligible.slice(), quorumRule, by })
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
     * Cast a vote. Returns { ok: true, accepted: true } when the vote counts, or a NAMED refusal whose record in
     * history explains what was refused - and which never enters the tally.
     *
     * F31: EVERY cast of this ballot goes through the ONE FIFO commit gate below (`castNow` is the critical
     * section), because `cast` awaits the middleware and a concurrent pair could otherwise interleave between the
     * duplicate check and `votes.set`. The gate is a mechanism, not a comment about single-threadedness.
     */
    async cast(member, value, { kind = 'decisive' } = {}) {
      gatePending += 1
      // F31+: with a durable log the INTENT is on record BEFORE the effect, and the outcome right after it —
      // so a crash in between is recoverable (`reconcile()`), never a lost or doubled vote.
      const rec = queue ? queue.reserve({ member, value, kind, target }) : null
      const run = () => castNow(member, value, { kind }).then(
        (r) => { if (queue) queue.complete(rec, r && r.ok === false ? 'refused' : 'accepted'); return r },
        (e) => { if (queue) queue.complete(rec, 'refused'); throw e })
      const ticket = gate.then(run, run)
      gate = ticket.then(
        () => { gatePending -= 1; gateCommits += 1 },
        () => { gatePending -= 1; gateCommits += 1 })
      return ticket
    },

    /**
     * Close and settle. `undecided` always carries a reason; a custom tally can replace the rule but can
     * never remove the three-valued contract.
     */
    async close(reason = 'closed') {
      if (state !== 'open' && state !== 'frozen') throw refuse('VMU_STATE', 'the ballot is not open')
      /**
       * F32 — THE "JUST DECIDED" WINDOW. A settlement that repeats the SAME outcome inside `dedupWindowMs` is
       * FOLDED into the previous announcement instead of being announced twice (the mechanism v5r needed when a
       * late duplicate close re-announced a verdict the room had already heard). Two honest limits, both stated:
       *   · only the SAME outcome folds — a different outcome inside the window is a real change and is never hidden;
       *   · with a middleware tally (`bus`) the face cannot know the next outcome without emitting, so it does not
       *     guess: the fold is skipped entirely and the middleware keeps owning announcements.
       * 0 = off (zero mechanism), which is the default.
       */
      const atNow = clock()
      const atMs = dedupMs > 0 ? msStrict(atNow, 'the ballot clock') : null
      if (dedupMs > 0 && !bus && lastClose && (atMs - lastClose.atMs) <= dedupMs) {
        const probe = tally({ votes: Object.fromEntries([...votes.entries()].map(([k, v]) => [k, v])), eligible: eligible.slice(), quorumRule })
        if (probe && probe.outcome === lastClose.outcome) {
          const previousAt = lastClose.at
          const previousMs = lastClose.atMs
          dedupedVerdicts += 1
          // A FOLDED settlement is still a settlement: the ballot must END UP tallied (otherwise it would stay
          // open and quietly keep accepting votes — the opposite of what a settlement is for). Only the
          // ANNOUNCEMENT is folded, never the state transition.
          state = 'tallied'
          frozen = false
          outcome = { outcome: probe.outcome, reason: 'folded into the previous settlement (F32 window ' + dedupMs + ' ms)',
            detail: probe.detail || null, at: atNow, folded: true }
          closedAt = atNow
          lastClose = { at: atNow, atMs, outcome: outcome.outcome }
          record('close-deduped', { at: atNow, windowMs: dedupMs, outcome: probe.outcome, previousAt })
          return { ok: true, deduped: true, state, outcome: outcome.outcome,
            reason: 'duplicate settlement folded: the same outcome was announced ' + (atMs - previousMs) + ' ms ago (window ' + dedupMs + ' ms)',
            windowMs: dedupMs, at: atNow, previousAt, tally: Object.assign({}, outcome) }
        }
      }
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
      lastClose = { at: atNow, atMs, outcome: outcome.outcome }
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

    /**
     * F31+ (Round 6) — RECONCILE with the durable log: replay every intent that was reserved but never completed,
     * in ticket order, and be IDEMPOTENT while doing it (a member votes once, so a replayed intent for a member
     * who already has a vote is completed as `skipped-duplicate` rather than overwriting it). Without a store this
     * reports `durable:false` — it does not pretend to have recovered anything.
     */
    reconcile() {
      if (!queue || !queue.durable) {
        return { ok: true, durable: false, pending: 0, replayed: 0,
          reason: 'no durable commit log is bound: there is nothing to reconcile (the seam is absent, not pretended)' }
      }
      const r = queue.recover()
      let replayed = 0
      for (const rec of r.pending) {
        const op = rec.op || {}
        if (op.member === undefined || op.member === null || votes.has(String(op.member))) {
          queue.complete(rec, 'skipped-duplicate')
          continue
        }
        votes.set(String(op.member), { value: op.value, kind: classifyVote(op.value, op.kind) || 'abstain',
          at: rec.at, recovered: true, ticket: rec.ticket })
        record('cast-recovered', { member: String(op.member), ticket: rec.ticket, value: op.value })
        queue.complete(rec, 'recovered')
        replayed += 1
      }
      return { ok: true, durable: true, tickets: r.tickets, pending: r.pending.length, replayed, reason: r.reason }
    },

    /** Observability (R11): the votes as counted, the tally state, and the full refusal-inclusive history. */
    status() {
      // F26: the counts are keyed by the FIXED vocabulary (for/against/abstain/unable/estimate), with `process`
      // kept apart because a process reading is not a vote at all.
      const byKind = { for: 0, against: 0, abstain: 0, unable: 0, estimate: 0, process: 0 }
      for (const v of votes.values()) byKind[v.kind] = (byKind[v.kind] || 0) + 1
      return {
        target, state, frozen, quorumRule,
        eligible: eligible.slice(),
        votes: Object.fromEntries([...votes.entries()].map(([k, v]) => [k, { value: v.value, kind: v.kind, recovered: !!v.recovered }])),
        voteCount: votes.size,
        byKind,
        voteKinds: VOTE_KINDS.slice(),
        // F31: the commit gate is observable state (how deep its queue currently is, how much it committed) and
        // F31+ says whether that gate is DURABLE (a store-backed log) or in-process only.
        gate: { serialized: true, pending: gatePending, commits: gateCommits,
          durable: !!(queue && queue.durable), log: queue ? queue.status() : null },
        // F32: the dedup window and how many duplicate settlements it folded.
        dedup: { windowMs: dedupMs, foldedVerdicts: dedupedVerdicts, lastClose: lastClose ? Object.assign({}, lastClose) : null },
        // F34: the opening criterion, before anyone hits it.
        openCriterion: {
          openers: openerList ? openerList.slice() : null,
          minEligible: minElectorate,
          requiresTarget: requiresTarget === true,
          satisfied: (minElectorate === 0 || eligible.length >= minElectorate) && (requiresTarget !== true || !!target),
        },
        // C-45 observability: which votes were rewritten to an abstention because a fidelity defect was declared,
        // and whether the enforcement seam is even bound (an unbound seam is visible, never assumed).
        fidelitySeam: !!fidelity,
        byFidelity: [...votes.entries()].filter(([, v]) => v && v.byFidelity === true)
          .map(([k, v]) => ({ member: k, declared: v.declared, vote: v.value, markerId: v.markerId || null })),
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
          // F32: the previous settlement travels, so the fold window survives a restart instead of re-announcing.
          lastClose: lastClose ? JSON.parse(JSON.stringify(lastClose)) : null, dedupedVerdicts,
          history: history.map((h) => JSON.parse(JSON.stringify(h))) },
        counters: { ballot: (/(\d+)\s*$/.exec(String(target || '')) || [])[1] ? Number(/(\d+)\s*$/.exec(String(target))[1]) : 0 },
        skipped: [{ what: 'bus', why: 'an injected bus is re-bound by the host, never serialised' },
          { what: 'commit-gate', why: 'F31: an in-flight queue is execution state, not truth — a restore starts with an empty gate' },
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
      lastClose = d.lastClose ? JSON.parse(JSON.stringify(d.lastClose)) : null
      dedupedVerdicts = Number(d.dedupedVerdicts || 0)
      gate = Promise.resolve()
      gatePending = 0
      return { ok: true, restored: true, restored_items: ['state', 'votes', 'history', 'outcome', 'dedup'], counters: { ballot: 0 }, skipped: (snap.skipped || []).slice(), state }
    },

    /** Process readings never decide (I-1). Exposed so a caller can see the separation explicitly. */
    processReadings() {
      return [...votes.values()].filter((v) => v.kind === 'process').map((v) => ({ value: v.value, at: v.at }))
    },
  }

  return ballot
}
