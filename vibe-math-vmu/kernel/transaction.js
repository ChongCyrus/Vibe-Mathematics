// vmu kernel · transaction — K1: a cross-service COMPENSATING transaction (docs/07 §4 append-only spirit,
// docs/08 tasks/stages referenced, never redefined).
//
// Why this exists (independent reviewer, round 7 / K1): `charter` + `delegation` + `tasks` often have to change
// TOGETHER, and the repository only ever had a single-service rollback — a half-finished multi-service change
// could not be undone. This module makes the compensation protocol explicit:
//
//   begin({ id, steps })   every step MUST carry BOTH directions: { service, apply, undo, label? }
//                          ⇒ a step without `undo` is refused AT BEGIN (never discovered after the write)
//   run({ id })            applies in order; on failure it compensates the applied steps in REVERSE order
//   status({ id })         the evidence: per-step trace (who/when/which/result) + what was undone
//   compensate({ id, reason })  an explicit, reason-carrying rollback of the applied steps
//
// FOUR HARD INVARIANTS (each one a refusal or an explicit state — never a silent half-write):
//   ① A FAILURE COMPENSATES IN REVERSE ORDER ⇒ the final state equals the initial state (the trace proves it).
//   ② A FAILING COMPENSATION IS NOT SWALLOWED ⇒ the transaction becomes `partial`, the failing step is NAMED,
//      and the evidence is kept for a human.
//   ③ A STEP WITHOUT `undo` IS REFUSED AT `begin` (`VMU_TX_STEP_NOT_COMPENSABLE`).
//   ④ THE SAME txId DOES NOT RUN TWICE: a second `run()` returns the recorded outcome (`idempotent:true`) —
//      and when an `idempotency` seam (kernel/idempotency.js, K6) is injected, the ledger backs that up
//      across processes too. Without the seam the module still works (its own record is authoritative).
// Invariants shared with the rest of the kernel:
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (list/history/trace cap)
//   · zero mechanism: with no transactions every READ answers empty and nothing throws
//   · the only time source is the injected `clock`; step order is the caller's order (deterministic)
//   · READ paths (status/list/history) never mutate the ledger
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL — the settings table and the
// docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_MAX_STEPS = 'vmu.tx.maxSteps'
const K_MAX_TRANSACTIONS = 'vmu.tx.maxTransactions'
const K_AUTO_COMPENSATE = 'vmu.tx.autoCompensate'
const K_COMPENSATE_REASON = 'vmu.tx.compensateNeedsReason'
const K_KEEP_EVIDENCE = 'vmu.tx.keepEvidence'
const K_TRACE_CAP = 'vmu.tx.traceCap'

const STATES = Object.freeze(['open', 'running', 'committed', 'compensated', 'partial', 'failed'])
const DEFAULT_LIST_CAP = 200

/** createTransaction — the compensating-transaction ledger. `idempotency` (K6) is an OPTIONAL seam. */
export function createTransaction({ clock = () => 0, log = null, settings = {}, bus = null, idempotency = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createTransaction needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the transaction it records */ } }
  }

  const maxSteps = nonNegInt(sget(K_MAX_STEPS, 0), 0)
  const maxTransactions = nonNegInt(sget(K_MAX_TRANSACTIONS, 200), 200)
  const autoCompensate = sget(K_AUTO_COMPENSATE, true) !== false
  const compensateNeedsReason = sget(K_COMPENSATE_REASON, true) !== false
  const keepEvidence = sget(K_KEEP_EVIDENCE, true) !== false
  const traceCap = nonNegInt(sget(K_TRACE_CAP, DEFAULT_LIST_CAP), DEFAULT_LIST_CAP)

  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by begin/run/compensate) ───────────────────────────────────────────────────
  const txs = new Map()
  const order = []
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  const counters = { begun: 0, runs: 0, committed: 0, compensated: 0, partial: 0, idempotentRuns: 0, stepsApplied: 0, stepsUndone: 0 }

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const txOf = (id) => txs.get(id) || null

  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'tx/refused', at: now(), code, message })
    return refuse(code, message, hint)
  }
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
    } catch (e) {
      bump(unwired, 'bus:' + hook, 1)
      say({ type: 'tx/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
    }
  }
  const errText = (e) => String((e && e.message) || e)
  /** A structural signature of the steps (function bodies cannot be hashed — see the report). */
  const signatureOf = (steps) => steps.map((s, i) => (i + 1) + ':' + s.service + ':' + (s.label || '')).join('|')
  /**
   * Bound the trace WITHOUT losing the evidence that matters: the failing row is always kept, plus the newest
   * rows up to the cap; the dropped count is reported (never silent). Order stays chronological.
   */
  const trimTrace = (t) => {
    const trace = t.trace
    if (traceCap <= 0 || trace.length <= traceCap) return { rows: trace.slice(), dropped: 0 }
    const keep = new Set()
    const failIdx = trace.findIndex((r) => r.ok === false)
    if (failIdx >= 0) keep.add(failIdx)
    for (let i = trace.length - 1; i >= 0 && keep.size < traceCap; i--) keep.add(i)
    const rows = trace.filter((_, i) => keep.has(i))
    return { rows, dropped: trace.length - rows.length }
  }
  const view = (t) => {
    const trimmed = trimTrace(t)
    return {
      id: t.id, state: t.state, settled: t.state === 'committed' || t.state === 'compensated',
      beganAt: t.beganAt, by: t.by, startedAt: t.startedAt, finishedAt: t.finishedAt,
      stepCount: t.steps.length, applied: t.applied.slice(), undone: t.undone.slice(),
      failedStep: t.failedStep === null ? null : { index: t.failedStep, service: t.steps[t.failedStep] ? t.steps[t.failedStep].service : null, label: t.steps[t.failedStep] ? t.steps[t.failedStep].label : null, error: t.failedError },
      compensationFailures: t.compensationFailures.map((x) => Object.assign({}, x)),
      trace: trimmed.rows, traceDropped: trimmed.dropped,
      signature: t.signature,
      outcome: t.outcome === null ? null : Object.assign({}, t.outcome),
    }
  }
  /** Compensate the APPLIED steps in reverse order. Returns the failures (never throws for a step error). */
  const compensateSteps = async (t, reason, by) => {
    const failures = []
    for (let i = t.applied.length - 1; i >= 0; i--) {
      const index = t.applied[i]
      const step = t.steps[index]
      if (t.undone.includes(index)) continue
      const at = now()
      try {
        const result = await step.undo({ txId: t.id, index, service: step.service, label: step.label, reason, by })
        t.undone.push(index)
        counters.stepsUndone += 1
        t.trace.push({ phase: 'undo', index, service: step.service, label: step.label, at, by, ok: true, result: result === undefined ? null : result, reason })
        record_({ type: 'tx/undo', id: t.id, index, service: step.service, ok: true, reason })
      } catch (e) {
        const at2 = now()
        // INVARIANT ②: a failing compensation is NAMED and kept — the transaction becomes `partial`.
        failures.push({ index, service: step.service, label: step.label, error: errText(e), at: at2 })
        t.trace.push({ phase: 'undo', index, service: step.service, label: step.label, at: at2, by, ok: false, error: errText(e), reason })
        record_({ type: 'tx/undo', id: t.id, index, service: step.service, ok: false, error: errText(e), reason })
      }
    }
    return failures
  }

  const api = {
    apiVersion,

    /**
     * Register a transaction. INVARIANT ③: every step must carry BOTH `apply` and `undo` — a step that cannot
     * be undone is refused HERE, before anything has been written.
     */
    begin({ id, steps, by = null } = {}) {
      if (typeof id !== 'string' || !id.trim()) throw deny('VMU_INVALID_ARGUMENT', 'begin needs a non-empty transaction id', 'e.g. { id: "tx-1", steps: [{ service: "tasks", apply, undo }] }')
      if (!Array.isArray(steps) || steps.length === 0) throw deny('VMU_INVALID_ARGUMENT', 'begin needs a non-empty `steps` array', 'a transaction with no steps commits nothing — say what it does')
      if (txOf(id)) throw deny('VMU_STATE', 'transaction "' + id + '" is already registered (state ' + txOf(id).state + ')', 'use a fresh id, or inspect it with status({ id })')
      if (maxSteps > 0 && steps.length > maxSteps) {
        throw deny('VMU_RESOURCE_BUDGET', 'too many steps: ' + steps.length + '/' + maxSteps + ' (vmu.tx.maxSteps)', 'split the transaction, or raise vmu.tx.maxSteps')
      }
      if (maxTransactions > 0 && txs.size >= maxTransactions) {
        throw deny('VMU_RESOURCE_BUDGET', 'too many transactions: ' + txs.size + '/' + maxTransactions + ' (vmu.tx.maxTransactions)', 'finish or compensate an older transaction, or raise vmu.tx.maxTransactions')
      }
      const seen = new Set()
      steps.forEach((s, i) => {
        if (!s || typeof s !== 'object') throw deny('VMU_TX_STEP_NOT_COMPENSABLE', 'step ' + (i + 1) + ' is not an object', 'every step needs { service, apply, undo }')
        if (typeof s.service !== 'string' || !s.service) throw deny('VMU_TX_STEP_NOT_COMPENSABLE', 'step ' + (i + 1) + ' needs a non-empty `service`', 'name the service so a partial outcome can be handed to a human')
        // INVARIANT ③ (the whole point): no undo ⇒ refuse at BEGIN, never after the write.
        if (typeof s.apply !== 'function') throw deny('VMU_TX_STEP_NOT_COMPENSABLE', 'step ' + (i + 1) + ' (' + s.service + ') provides no `apply`', 'a step must say what it does AND how to undo it')
        if (typeof s.undo !== 'function') {
          throw deny('VMU_TX_STEP_NOT_COMPENSABLE', 'step ' + (i + 1) + ' (' + s.service + ') provides no `undo`: it cannot be compensated',
            'a compensating transaction requires BOTH directions on every step (K1) — add undo(), or move the write out of the transaction')
        }
        if (s.label !== undefined && s.label !== null && typeof s.label !== 'string') throw deny('VMU_TX_STEP_NOT_COMPENSABLE', 'step ' + (i + 1) + ': `label` must be a string when given', 'the label is what a human reads in the evidence')
        const key = s.service + ':' + (s.label || '') + ':' + i
        if (seen.has(key)) throw deny('VMU_INVALID_ARGUMENT', 'duplicate step: ' + key, 'two identical steps in one transaction are almost always a bug')
        seen.add(key)
      })
      const t = {
        id: String(id), steps: steps.slice(), signature: signatureOf(steps),
        state: 'open', beganAt: now(), by: by === null || by === undefined ? null : String(by),
        startedAt: null, finishedAt: null, applied: [], undone: [], trace: [],
        failedStep: null, failedError: null, compensationFailures: [], outcome: null, compensateReason: null, compensatedBy: null,
      }
      txs.set(t.id, t)
      order.push(t.id)
      counters.begun += 1
      record_({ type: 'tx/begun', id: t.id, steps: steps.length, signature: t.signature })
      say({ type: 'tx/begun', at: t.beganAt, id: t.id, steps: steps.length })
      return { ok: true, id: t.id, state: t.state, steps: steps.length, signature: t.signature, beganAt: t.beganAt, now: now() }
    },

    /**
     * Run the transaction. On a step failure the applied steps are compensated IN REVERSE ORDER (invariant ①);
     * a failing compensation yields `partial` with the failing step NAMED (invariant ②). A second run() never
     * re-executes (invariant ④).
     */
    async run({ id, by = null } = {}) {
      const t = txOf(id)
      if (!t) throw deny('VMU_NO_SUCH_OBJECT', 'unknown transaction: ' + String(id), 'no begin() was recorded — known: ' + (order.join(', ') || '(none)'))
      if (t.state === 'running') throw deny('VMU_STATE', 'transaction "' + t.id + '" is already running', 'a transaction does not run twice concurrently')
      if (t.state === 'committed' || t.state === 'compensated' || t.state === 'partial' || t.state === 'failed') {
        // INVARIANT ④: the recorded outcome is replayed; NOTHING is executed again.
        counters.idempotentRuns += 1
        say({ type: 'tx/idempotent-run', at: now(), id: t.id, state: t.state })
        return Object.assign({ ok: t.state === 'committed', idempotent: true, executed: false, note: 'this transaction already ran: the recorded outcome is returned and nothing is executed' }, view(t))
      }

      // K6 linkage (optional): if the idempotency seam is injected, the txId is registered there too, so a
      // replay in another process is refused/deduplicated by the ledger rather than by this in-memory record.
      let ledgerKey = null
      if (idempotency && typeof idempotency.begin === 'function') {
        try {
          ledgerKey = 'tx:' + t.id
          const b = idempotency.begin({ key: ledgerKey, payload: { steps: t.signature }, by: t.by })
          if (b && b.deduplicated === true) {
            counters.idempotentRuns += 1
            t.state = 'committed'
            t.outcome = { ledger: true, deduplicated: true, result: b.result === undefined ? null : b.result }
            t.finishedAt = now()
            return Object.assign({ ok: true, idempotent: true, executed: false, source: 'idempotency-ledger', note: 'the idempotency ledger says this tx already committed: nothing is executed' }, view(t))
          }
        } catch (e) {
          // A ledger refusal (e.g. the same txId with a DIFFERENT signature) is surfaced by name — it is a bug.
          if (e && e.code) throw e
          bump(unwired, 'idempotency-seam', 1)
          say({ type: 'tx/ledger-unwired', at: now(), id: t.id, why: errText(e) })
        }
      }

      t.state = 'running'
      t.startedAt = now()
      counters.runs += 1
      const applied = []
      let failure = null
      for (let i = 0; i < t.steps.length; i++) {
        const step = t.steps[i]
        const at = now()
        try {
          const result = await step.apply({ txId: t.id, index: i, service: step.service, label: step.label, by })
          t.applied.push(i)
          applied.push(i)
          counters.stepsApplied += 1
          t.trace.push({ phase: 'apply', index: i, service: step.service, label: step.label, at, by: by === null ? t.by : String(by), ok: true, result: result === undefined ? null : result, durationMs: now() - at })
          record_({ type: 'tx/apply', id: t.id, index: i, service: step.service, ok: true })
        } catch (e) {
          const at2 = now()
          t.trace.push({ phase: 'apply', index: i, service: step.service, label: step.label, at: at2, by: by === null ? t.by : String(by), ok: false, error: errText(e), durationMs: at2 - at })
          record_({ type: 'tx/apply', id: t.id, index: i, service: step.service, ok: false, error: errText(e) })
          t.failedStep = i
          t.failedError = errText(e)
          failure = { index: i, service: step.service, label: step.label === undefined ? null : step.label, error: errText(e), at: at2 }
          break
        }
      }

      if (failure === null) {
        t.state = 'committed'
        t.finishedAt = now()
        t.outcome = { ok: true, state: 'committed', applied: applied.slice(), stepCount: t.steps.length }
        counters.committed += 1
        record_({ type: 'tx/committed', id: t.id, applied: applied.length })
        say({ type: 'tx/committed', at: t.finishedAt, id: t.id, applied: applied.length })
        fire('tx/committed', { id: t.id, applied: applied.length })
        if (ledgerKey && idempotency && typeof idempotency.commit === 'function') {
          try { idempotency.commit({ key: ledgerKey, result: t.outcome }) } catch (e) { if (e && e.code) throw e; bump(unwired, 'idempotency-seam', 1) }
        }
        return Object.assign({ ok: true, idempotent: false, executed: true, failure: null }, view(t))
      }

      // INVARIANT ①: compensate in REVERSE order. INVARIANT ②: a failing undo becomes `partial`, named.
      if (!autoCompensate) {
        t.state = 'failed'
        t.finishedAt = now()
        t.outcome = { ok: false, state: 'failed', failure, applied: applied.slice(), note: 'vmu.tx.autoCompensate=false: the applied steps are LEFT IN PLACE — call compensate({ id, reason }) explicitly' }
        record_({ type: 'tx/failed', id: t.id, index: failure.index, service: failure.service, error: failure.error })
        say({ type: 'tx/failed', at: t.finishedAt, id: t.id, why: failure.error })
        fire('tx/failed', { id: t.id, failedStep: failure.index, service: failure.service })
        return Object.assign({ ok: false, idempotent: false, executed: true, failure, compensated: false, needsCompensation: true }, view(t))
      }
      const reason = 'automatic compensation after ' + failure.service + ' failed: ' + failure.error
      t.compensateReason = reason
      t.compensatedBy = by === null ? t.by : String(by)
      const failures = await compensateSteps(t, reason, by)
      t.finishedAt = now()
      t.compensationFailures = failures
      if (failures.length === 0) {
        t.state = 'compensated'                 // the final state equals the initial one
        t.outcome = { ok: false, state: 'compensated', failure, applied: applied.slice(), undone: t.undone.slice(), compensated: true }
        counters.compensated += 1
        record_({ type: 'tx/compensated', id: t.id, undone: t.undone.length, why: reason })
        say({ type: 'tx/compensated', at: t.finishedAt, id: t.id, undone: t.undone.length, why: reason })
        fire('tx/compensated', { id: t.id, undone: t.undone.length })
      } else {
        t.state = 'partial'                     // INVARIANT ②: NOT swallowed — named + evidence kept
        t.outcome = { ok: false, state: 'partial', failure, applied: applied.slice(), undone: t.undone.slice(), compensationFailures: failures.map((x) => Object.assign({}, x)), compensated: false, note: 'a compensation FAILED: the scene is preserved for a human (see status().evidence)' }
        counters.partial += 1
        record_({ type: 'tx/partial', id: t.id, failures, why: reason })
        say({ type: 'tx/partial', at: t.finishedAt, id: t.id, failures, why: reason })
        fire('tx/partial', { id: t.id, failures: failures.map((x) => ({ index: x.index, service: x.service })) })
      }
      if (ledgerKey && idempotency && typeof idempotency.abort === 'function') {
        try { idempotency.abort({ key: ledgerKey, reason, by: 'transaction' }) } catch (e) { if (e && e.code && e.code !== 'VMU_STATE') throw e; bump(unwired, 'idempotency-seam', 1) }
      }
      return Object.assign({ ok: false, idempotent: false, executed: true, failure, compensated: failures.length === 0, needsHuman: failures.length > 0, reason }, view(t))
    },

    /**
     * Explicit compensation (for `failed`/`open` transactions, or a deliberate rollback of a committed one).
     * INVARIANT ⑥: a reason is required when `vmu.tx.compensateNeedsReason` is on.
     */
    async compensate({ id, reason = null, by = null } = {}) {
      const t = txOf(id)
      if (!t) throw deny('VMU_NO_SUCH_OBJECT', 'unknown transaction: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'compensate needs a non-empty `by` (who compensates)', 'compensation is audited: who / why / when')
      if (compensateNeedsReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'compensating ' + t.id + ' requires a reason (vmu.tx.compensateNeedsReason)',
          'say why the change is being rolled back — an unexplained compensation hides a failed write (K1)')
      }
      if (t.state === 'running') throw deny('VMU_STATE', 'transaction "' + t.id + '" is still running: it cannot be compensated concurrently', 'wait for run() to settle')
      if (t.state === 'compensated') return Object.assign({ ok: true, idempotent: true, already: true, note: 'this transaction was already compensated' }, view(t))
      if (t.applied.length === 0) throw deny('VMU_STATE', 'transaction "' + t.id + '" has nothing applied to compensate (state ' + t.state + ')', 'there is no half-write to undo')
      const why = reason === null ? 'explicit compensation' : String(reason)
      t.compensateReason = why
      t.compensatedBy = String(by)
      const failures = await compensateSteps(t, why, by)
      t.finishedAt = now()
      t.compensationFailures = failures
      if (failures.length === 0) {
        t.state = 'compensated'
        t.outcome = Object.assign({}, t.outcome || {}, { state: 'compensated', compensated: true, undone: t.undone.slice() })
        counters.compensated += 1
        record_({ type: 'tx/compensated', id: t.id, undone: t.undone.length, why, by })
        say({ type: 'tx/compensated', at: t.finishedAt, id: t.id, undone: t.undone.length, why, by })
        fire('tx/compensated', { id: t.id, undone: t.undone.length, by })
      } else {
        t.state = 'partial'
        t.outcome = Object.assign({}, t.outcome || {}, { state: 'partial', compensated: false, undone: t.undone.slice(), compensationFailures: failures.map((x) => Object.assign({}, x)) })
        counters.partial += 1
        record_({ type: 'tx/partial', id: t.id, failures, why, by })
        say({ type: 'tx/partial', at: t.finishedAt, id: t.id, failures, by })
        fire('tx/partial', { id: t.id, failures: failures.map((x) => ({ index: x.index, service: x.service })), by })
      }
      return Object.assign({ ok: failures.length === 0, idempotent: false, executed: true, needsHuman: failures.length > 0, reason: why }, view(t))
    },

    /** READ-ONLY: one transaction (with its evidence) or an aggregate when no id is given. */
    status({ id = null } = {}) {
      if (id !== null) {
        const t = txOf(id)
        if (!t) throw deny('VMU_NO_SUCH_OBJECT', 'unknown transaction: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
        const v = view(t)
        return {
          ok: true, transaction: v, evidence: keepEvidence
            ? { failedStep: v.failedStep, applied: v.applied.slice(), undone: v.undone.slice(), compensationFailures: v.compensationFailures, trace: v.trace, traceDropped: v.traceDropped }
            : null,
          note: t.state === 'partial'
            ? 'PARTIAL: a compensation failed — the named step must be handled by a human (the evidence is kept)'
            : t.state === 'committed' ? 'COMMITTED: every step applied' : t.state === 'compensated' ? 'COMPENSATED: the applied steps were undone in reverse order (state == initial)' : 'state: ' + t.state,
        }
      }
      const all = order.map((x) => txs.get(x)).filter(Boolean)
      return {
        ok: true, configured: all.length > 0,
        transactions: { total: all.length, open: all.filter((t) => t.state === 'open').length, running: all.filter((t) => t.state === 'running').length, committed: all.filter((t) => t.state === 'committed').length, compensated: all.filter((t) => t.state === 'compensated').length, partial: all.filter((t) => t.state === 'partial').length, failed: all.filter((t) => t.state === 'failed').length },
        maxSteps, maxTransactions, autoCompensate, compensateNeedsReason, keepEvidence, traceCap,
        counters: Object.assign({}, counters),
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals), refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired), unwiredTotal: sumOf(unwired),
        idempotencyInjected: !!(idempotency && typeof idempotency.begin === 'function'),
        at: now(),
        note: 'K1: every step is applied forward and compensated backward; a failing compensation is reported as `partial` and never swallowed',
      }
    },

    /** READ-ONLY. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((x) => txs.get(x)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((t) => t.state === state)
      const kept = all.slice(0, cap).map(view)
      return { ok: true, transactions: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** READ-ONLY: the audit trail (a capped ring; drops are counted). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => id === null || r.id === id)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },
  }

  return api
}
