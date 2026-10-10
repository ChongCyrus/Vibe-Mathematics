// Independent test for vmu kernel · transaction (no dependency on kernel/index.js).
// Spec source: docs/07-durability-library.md (append-only spirit) + docs/08 (tasks/stages referenced only).
// K1 under test: a multi-service change is applied forward and COMPENSATED BACKWARD; a failing compensation is
// never swallowed (it is `partial`, named, and the evidence is kept).
// Run: node tests/vmu-transaction.test.mjs     Last line: === VMU TRANSACTION: N passed, M failed ===
import { createTransaction, refuse } from '../vibe-math-vmu/kernel/transaction.js'
import { createIdempotency } from '../vibe-math-vmu/kernel/idempotency.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
async function throwsNamed(fn, code, label) {
  try { await fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus({ throwOnEmit = false } = {}) {
  const rows = []; const topics = []
  return { rows, topics, declareTopic: (n) => { topics.push(n); return { ok: true, topic: n, existing: false } }, emit: (h, p) => { if (throwOnEmit) throw new Error('bus down'); rows.push({ hook: h, payload: p }) } }
}
/** A fake multi-service world: state per service + the CALL SEQUENCE (the evidence invariant ① needs). */
function fakeWorld() {
  const state = { tasks: {}, charter: {}, delegation: {}, tx: null }
  const calls = []
  const snapshot = () => JSON.parse(JSON.stringify(state))
  return { state, calls, snapshot }
}
const S = (extra = {}) => Object.assign({}, extra)

// ── 1. zero mechanism: nothing registered ⇒ empty answers, no throw ──────────────────────────────────
{
  const c = fakeClock(0)
  const tx = createTransaction({ clock: c.clock })
  ok(tx.status().configured === false, 'zero-mechanism: status().configured=false')
  ok(tx.list().count === 0 && tx.list().transactions.length === 0, 'zero-mechanism: list() is empty')
  ok(tx.history().count === 0, 'zero-mechanism: history() is empty')
  await throwsNamed(() => tx.status({ id: 'nope' }), 'VMU_NO_SUCH_OBJECT', 'zero-mechanism: status({id}) for an unknown id is refused by name')
  await throwsNamed(() => tx.run({ id: 'nope' }), 'VMU_NO_SUCH_OBJECT', 'zero-mechanism: run() on an unknown id is refused by name')
  await throwsNamed(() => tx.compensate({ id: 'nope', by: 'office', reason: 'x' }), 'VMU_NO_SUCH_OBJECT', 'zero-mechanism: compensate() on an unknown id is refused by name')
  ok(tx.status().counters.begun === 0, 'zero-mechanism: nothing was begun')
}

// ── 2. INVARIANT ③: a step without `undo` is refused AT BEGIN (never after the write) ────────────────
{
  const c = fakeClock(0)
  const tx = createTransaction({ clock: c.clock, settings: S() })
  let ran = 0
  const e = await throwsNamed(() => Promise.resolve(tx.begin({ id: 't1', steps: [{ service: 'tasks', apply: () => { ran += 1 }, undo: null }] })),
    'VMU_TX_STEP_NOT_COMPENSABLE', '③: a step without undo is refused at begin')
  ok(!!e && /undo/.test(e.message) && /K1/.test(String(e.hint)), '③: the refusal names the missing direction and the K1 rule')
  ok(ran === 0, '③: nothing was applied by the refused begin')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 't2', steps: [{ service: 'tasks', undo: () => {} }] })), 'VMU_TX_STEP_NOT_COMPENSABLE', '③: a step without apply is refused too')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 't3', steps: [{ apply: () => {}, undo: () => {} }] })), 'VMU_TX_STEP_NOT_COMPENSABLE', '③: a step without a service name is refused')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 't4', steps: ['not-a-step'] })), 'VMU_TX_STEP_NOT_COMPENSABLE', '③: a non-object step is refused')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 't5', steps: [{ service: 'a', apply: () => {}, undo: () => {}, label: 7 }] })), 'VMU_TX_STEP_NOT_COMPENSABLE', '③: a non-string label is refused')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 't6', steps: [] })), 'VMU_INVALID_ARGUMENT', '③: an empty step list is refused')
  await throwsNamed(() => Promise.resolve(tx.begin({ steps: [{ service: 'a', apply: () => {}, undo: () => {} }] })), 'VMU_INVALID_ARGUMENT', '③: a missing transaction id is refused')
  const okTx = tx.begin({ id: 'good', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] })
  ok(okTx.ok === true && okTx.state === 'open' && okTx.steps === 1, '③: a two-direction step is accepted and the transaction is open')
  await throwsNamed(() => Promise.resolve(tx.begin({ id: 'good', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] })), 'VMU_STATE', '③: a duplicate transaction id is refused')
  ok(tx.status().counters.begun === 1, '③: only the accepted begin is counted')
  ok(tx.status().refusals.VMU_TX_STEP_NOT_COMPENSABLE === 5, '③: every refused begin is counted by code')
}

// ── 3. INVARIANT ①: a failure compensates in REVERSE order; the final state equals the initial one ───
{
  const c = fakeClock(0)
  const log = fakeLog()
  const tx = createTransaction({ clock: c.clock, log, settings: S() })
  const w = fakeWorld()
  const initial = w.snapshot()
  const steps = [
    { service: 'tasks', label: 'create t-1', apply: (x) => { w.calls.push('tasks.apply:' + x.index); w.state.tasks['t-1'] = true; return 1 }, undo: (x) => { w.calls.push('tasks.undo:' + x.index); delete w.state.tasks['t-1'] } },
    { service: 'charter', label: 'amend', apply: (x) => { w.calls.push('charter.apply:' + x.index); w.state.charter.v2 = true; return 2 }, undo: (x) => { w.calls.push('charter.undo:' + x.index); delete w.state.charter.v2 } },
    { service: 'delegation', label: 'grant', apply: (x) => { w.calls.push('delegation.apply:' + x.index); throw new Error('delegation refused (S-2)') }, undo: (x) => { w.calls.push('delegation.undo:' + x.index) } },
  ]
  tx.begin({ id: 'tx-1', steps, by: 'office' })
  const r = await tx.run({ id: 'tx-1' })
  ok(r.ok === false && r.state === 'compensated' && r.compensated === true, '①: a step failure ends in `compensated`')
  ok(w.calls.join(' ') === 'tasks.apply:0 charter.apply:1 delegation.apply:2 charter.undo:1 tasks.undo:0', '①: the CALL SEQUENCE is exactly apply…undo in REVERSE order')
  ok(JSON.stringify(w.snapshot()) === JSON.stringify(initial), '①: the final state EQUALS the initial state')
  ok(r.failure.index === 2 && r.failure.service === 'delegation' && /refused/.test(r.failure.error), '①: the failure is reported with its step, service and error')
  ok(r.applied.join(',') === '0,1' && r.undone.join(',') === '1,0', '①: applied and undone lists are exact and reverse-ordered')
  ok(log.rows.some((x) => x.type === 'tx/compensated' && /automatic compensation/.test(String(x.why))), '①: the automatic compensation is audited with its reason')
  ok(tx.status({ id: 'tx-1' }).transaction.state === 'compensated', '①: status() reports the compensated state')
  const four = fakeWorld()
  const tx2 = createTransaction({ clock: c.clock, settings: S() })
  const mk = (name, key, opts = {}) => ({
    service: name, label: key,
    apply: (x) => { four.calls.push(name + '.apply:' + x.index); if (opts.fail) throw new Error(name + ' boom'); four.state[name] = four.state[name] || {}; four.state[name][key] = true },
    undo: (x) => { four.calls.push(name + '.undo:' + x.index); if (opts.failUndo) throw new Error(name + ' undo boom'); four.state[name] = four.state[name] || {}; delete four.state[name][key] },
  })
  tx2.begin({ id: 'tx-2', steps: [mk('a', '1'), mk('b', '2'), mk('c', '3', { fail: true }), mk('d', '4')] })
  const r2 = await tx2.run({ id: 'tx-2' })
  ok(r2.state === 'compensated' && four.calls.join(' ') === 'a.apply:0 b.apply:1 c.apply:2 b.undo:1 a.undo:0', '①: the untouched trailing step is NEVER applied and earlier ones are undone in reverse')
  const bucket = (name) => Object.keys(four.state[name] || {})
  ok(bucket('a').length === 0 && bucket('b').length === 0 && bucket('c').length === 0 && bucket('d').length === 0, '①: no half-write survives')
}

// ── 4. INVARIANT ②: a failing compensation ⇒ `partial`, the step is NAMED, the evidence is kept ──────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const tx = createTransaction({ clock: c.clock, log, settings: S() })
  const w = fakeWorld()
  w
  const steps = [
    { service: 'tasks', label: 'create t-1', apply: (x) => { w.calls.push('tasks.apply:' + x.index); w.state.tasks['t-1'] = true }, undo: (x) => { w.calls.push('tasks.undo:' + x.index); delete w.state.tasks['t-1'] } },
    { service: 'charter', label: 'amend', apply: (x) => { w.calls.push('charter.apply:' + x.index); w.state.charter.v2 = true }, undo: (x) => { w.calls.push('charter.undo:' + x.index); throw new Error('charter rollback failed') } },
    { service: 'delegation', label: 'grant', apply: () => { throw new Error('delegation refused') }, undo: () => {} },
  ]
  tx.begin({ id: 'tx-p', steps })
  const r = await tx.run({ id: 'tx-p' })
  ok(r.ok === false && r.state === 'partial' && r.needsHuman === true, '②: a failing compensation yields `partial` (never a swallowed error)')
  ok(r.compensationFailures.length === 1 && r.compensationFailures[0].index === 1 && r.compensationFailures[0].service === 'charter', '②: the failing compensation step is NAMED')
  ok(/charter rollback failed/.test(r.compensationFailures[0].error), '②: the compensation error text is kept')
  ok(r.undone.join(',') === '0' && r.applied.join(',') === '0,1', '②: what could be undone is recorded, what could not is named')
  ok(w.state.charter.v2 === true, '②: the scene is PRESERVED (the failed undo left the state as it was)')
  const st = tx.status({ id: 'tx-p' })
  ok(st.transaction.state === 'partial' && /PARTIAL/.test(st.note), '②: status() says PARTIAL and points at the evidence')
  ok(st.evidence.compensationFailures.length === 1 && st.evidence.failedStep.index === 2, '②: the evidence keeps the failed step and the compensation failure')
  ok(st.evidence.trace.some((x) => x.phase === 'undo' && x.ok === false && x.error === 'charter rollback failed'), '②: the trace has the failing undo row (ok:false + error)')
  ok(log.rows.some((x) => x.type === 'tx/partial'), '②: the partial outcome is audited')
  ok(tx.status().transactions.partial === 1, '②: status() counts it as partial')
  const retry = await tx.run({ id: 'tx-p' })
  ok(retry.idempotent === true && retry.executed === false && retry.state === 'partial', '②: re-running a partial transaction replays the outcome and does NOT redo anything')
  ok(w.calls.filter((x) => x.endsWith('.apply:0')).length === 1, '②: no step was applied twice')
}

// ── 5. INVARIANT ④: the same txId does not run twice (in-memory, and via the K6 ledger) ──────────────
{
  const c = fakeClock(0)
  const w = fakeWorld()
  w
  const tx = createTransaction({ clock: c.clock, settings: S() })
  const steps = [{ service: 'tasks', label: 'x', apply: (x) => { w.calls.push('tasks.apply:' + x.index); w.state.tasks.t1 = true }, undo: (x) => { w.calls.push('tasks.undo:' + x.index); delete w.state.tasks.t1 } }]
  tx.begin({ id: 'tx-i', steps })
  const r1 = await tx.run({ id: 'tx-i' })
  ok(r1.ok === true && r1.state === 'committed' && r1.executed === true, '④: the first run executes and commits')
  const r2 = await tx.run({ id: 'tx-i' })
  ok(r2.idempotent === true && r2.executed === false && r2.state === 'committed' && r2.outcome.applied.length === 1, '④: the second run replays the recorded outcome')
  ok(w.calls.length === 1, '④: the fake service was called EXACTLY once')
  ok(tx.status().counters.idempotentRuns === 1, '④: the idempotent run is counted')

  // K6 linkage: two transaction instances sharing ONE idempotency ledger ⇒ the replay is refused across instances.
  const ledger = createIdempotency({ clock: c.clock })
  const w2 = fakeWorld()
  w2
  const a = createTransaction({ clock: c.clock, settings: S(), idempotency: ledger })
  const stepsA = [{ service: 'tasks', label: 'x', apply: (x) => { w2.calls.push('tasks.apply:' + x.index); w2.state.tasks.t1 = true }, undo: () => {} }]
  a.begin({ id: 'tx-led', steps: stepsA })
  const ra = await a.run({ id: 'tx-led' })
  ok(ra.ok === true && ra.state === 'committed', '④(ledger): the first instance commits and records the tx in the ledger')
  const b = createTransaction({ clock: c.clock, settings: S(), idempotency: ledger })
  b.begin({ id: 'tx-led', steps: stepsA })
  const rb = await b.run({ id: 'tx-led' })
  ok(rb.idempotent === true && rb.executed === false && rb.source === 'idempotency-ledger', '④(ledger): the second instance is deduplicated BY THE LEDGER (K6 ↔ K1)')
  ok(w2.calls.length === 1, '④(ledger): the work ran exactly once across both instances')
  const bad = createTransaction({ clock: c.clock, settings: S(), idempotency: ledger })
  bad.begin({ id: 'tx-led', steps: [{ service: 'tasks', label: 'DIFFERENT', apply: () => {}, undo: () => {} }] })
  const e = await throwsNamed(() => bad.run({ id: 'tx-led' }), 'VMU_IDEMPOTENCY_KEY_REUSED', '④(ledger): the same txId with DIFFERENT steps is refused by the ledger')
  ok(!!e && /different payload|DIFFERENT/i.test(String(e.message) + String(e.hint)), '④(ledger): the ledger refusal explains the payload difference')
  const broken = createTransaction({ clock: c.clock, settings: S(), idempotency: { begin: () => { throw new Error('ledger down') }, commit: () => {}, abort: () => {} } })
  broken.begin({ id: 'tx-b', steps: [{ service: 's', apply: () => {}, undo: () => {} }] })
  const rbr = await broken.run({ id: 'tx-b' })
  ok(rbr.ok === true && rbr.state === 'committed', '④(ledger): a broken ledger never blocks the transaction')
  ok(broken.status().unwired['idempotency-seam'] === 1, '④(ledger): the broken seam is COUNTED as a wiring gap')
}

// ── 6. INVARIANT ⑤: every step is traced (who/when/which/result) from the injected clock ─────────────
{
  const c = fakeClock(100)
  const tx = createTransaction({ clock: c.clock, settings: S() })
  const w = fakeWorld()
  w
  const steps = [
    { service: 'a', label: 'one', apply: (x) => { c.advance(10); return { done: 1 } }, undo: (x) => { c.advance(5) } },
    { service: 'b', label: 'two', apply: () => { c.advance(7); return 'ok' }, undo: () => {} },
  ]
  tx.begin({ id: 'tx-t', steps, by: 'office' })
  const r = await tx.run({ id: 'tx-t', by: 'worker' })
  const st = tx.status({ id: 'tx-t' })
  const trace = st.evidence.trace
  ok(trace.length === 2 && trace.every((x) => x.phase === 'apply'), '⑤: the committed trace has one row per step')
  ok(trace[0].at === 100 && trace[0].by === 'worker' && trace[0].service === 'a' && trace[0].label === 'one', '⑤: each row records WHEN (injected clock), WHO, WHICH step')
  ok(trace[0].ok === true && trace[0].result.done === 1 && trace[1].result === 'ok', '⑤: the step RESULT is recorded')
  ok(trace[0].durationMs === 10 && trace[1].durationMs === 7, '⑤: durations come from the injected clock (no real time)')
  ok(r.outcome.state === 'committed' && tx.status().counters.stepsApplied === 2, '⑤: the counters agree with the trace')

  const c2 = fakeClock(0)
  const tx2 = createTransaction({ clock: c2.clock, settings: S() })
  const w3 = fakeWorld()
  w3
  tx2.begin({ id: 'tx-u', steps: [
    { service: 'a', label: 'a', apply: () => { throw new Error('nope') }, undo: () => {} },
  ] })
  const r2 = await tx2.run({ id: 'tx-u' })
  const t2 = tx2.status({ id: 'tx-u' }).evidence.trace
  ok(r2.state === 'compensated' && t2.length === 1 && t2[0].ok === false && t2[0].error === 'nope', '⑤: a failing apply leaves a trace row with ok:false and the error')
}

// ── 7. INVARIANT ⑥ + explicit compensation ────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const w = fakeWorld()
  w
  const tx = createTransaction({ clock: c.clock, log, settings: S({ 'vmu.tx.autoCompensate': false }) })
  const steps = [
    { service: 'tasks', label: 'x', apply: (x) => { w.calls.push('tasks.apply:' + x.index); w.state.tasks.t1 = true }, undo: (x) => { w.calls.push('tasks.undo:' + x.index); delete w.state.tasks.t1 } },
    { service: 'charter', label: 'y', apply: () => { throw new Error('boom') }, undo: () => {} },
  ]
  tx.begin({ id: 'tx-x', steps })
  const r = await tx.run({ id: 'tx-x' })
  ok(r.state === 'failed' && r.needsCompensation === true && r.compensated === false, 'autoCompensate=false: the applied steps are LEFT in place and flagged')
  ok(w.state.tasks.t1 === true && w.calls.join(' ') === 'tasks.apply:0', 'autoCompensate=false: no undo ran yet (explicitly)')
  await throwsNamed(() => tx.compensate({ id: 'tx-x', by: 'office' }), 'VMU_REASON_REQUIRED', '⑥: an explicit compensation without a reason is refused')
  await throwsNamed(() => tx.compensate({ id: 'tx-x', reason: 'rollback' }), 'VMU_INVALID_ARGUMENT', '⑥: a compensation without an actor is refused')
  const comp = await tx.compensate({ id: 'tx-x', by: 'office', reason: 'the charter step failed' })
  ok(comp.ok === true && comp.state === 'compensated', '⑥: a reasoned compensation undoes the applied step')
  ok(w.state.tasks.t1 === undefined && w.calls.join(' ') === 'tasks.apply:0 tasks.undo:0', '⑥: the fake state is back to the initial one')
  ok(log.rows.some((x) => x.type === 'tx/compensated' && x.why === 'the charter step failed' && x.by === 'office'), '⑥: the explicit compensation is audited (who/why/when)')
  ok((await tx.compensate({ id: 'tx-x', by: 'office', reason: 'again' })).already === true, '⑥: compensating twice is idempotent')
  const empty = createTransaction({ clock: c.clock, settings: S() })
  empty.begin({ id: 'tx-e', steps: [{ service: 'a', apply: () => {}, undo: () => {} }] })
  await throwsNamed(() => empty.compensate({ id: 'tx-e', by: 'office', reason: 'nothing yet' }), 'VMU_STATE', '⑥: compensating a transaction with nothing applied is refused by name')
  const noReason = createTransaction({ clock: c.clock, settings: S({ 'vmu.tx.compensateNeedsReason': false }) })
  noReason.begin({ id: 'tx-n', steps: [{ service: 'a', apply: () => {}, undo: () => {} }] })
  await noReason.run({ id: 'tx-n' })
  ok((await noReason.compensate({ id: 'tx-n', by: 'office' })).ok === true, '⑥: compensateNeedsReason=false allows a bare compensation (disclosed in status)')
  ok(noReason.status().compensateNeedsReason === false, '⑥: status() declares the rule')
}

// ── 8. caps: steps and transactions (named refusal with current/limit) ────────────────────────────────
{
  const c = fakeClock(0)
  const tx = createTransaction({ clock: c.clock, settings: S({ 'vmu.tx.maxSteps': 2, 'vmu.tx.maxTransactions': 2 }) })
  const st = (n) => Array.from({ length: n }, (_, i) => ({ service: 's' + i, apply: () => {}, undo: () => {} }))
  const e = await throwsNamed(() => Promise.resolve(tx.begin({ id: 'big', steps: st(3) })), 'VMU_RESOURCE_BUDGET', 'caps: too many steps is refused by name')
  ok(!!e && /3\/2/.test(e.message), 'caps: the step refusal states current/limit (3/2)')
  tx.begin({ id: 'a', steps: st(1) })
  tx.begin({ id: 'b', steps: st(1) })
  const e2 = await throwsNamed(() => Promise.resolve(tx.begin({ id: 'c', steps: st(1) })), 'VMU_RESOURCE_BUDGET', 'caps: too many transactions is refused by name')
  ok(!!e2 && /2\/2/.test(e2.message), 'caps: the transaction refusal states current/limit (2/2)')
  ok(tx.list().count === 2, 'caps: nothing was evicted to make room')
}

// ── 9. truncation counting: list / history / trace cap ────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const tx = createTransaction({ clock: c.clock, settings: S({ 'vmu.tx.traceCap': 2 }) })
  for (let i = 1; i <= 3; i++) tx.begin({ id: 't' + i, steps: [{ service: 's', apply: () => {}, undo: () => {} }] })
  const all = tx.list()
  ok(all.count === 3 && all.available === 3 && all.dropped === 0 && all.truncated === false, 'list: three transactions, no truncation')
  const capped = tx.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 3 && capped.dropped === 1 && capped.truncated === true, 'list: a limit reports the DROPPED count (1)')
  ok(capped.transactions[0].id === 't1' && capped.transactions[1].id === 't2', 'list: deterministic insertion order')
  ok(tx.list({ state: 'open' }).count === 3 && tx.list({ state: 'committed' }).count === 0, 'list: state filter works')
  const h = tx.history({ limit: 2 })
  ok(h.count === 2 && h.available >= 3 && h.dropped === h.available - 2, 'history: the ring reports drops')
  const four = fakeWorld()
  four
  const txr = createTransaction({ clock: c.clock, settings: S({ 'vmu.tx.traceCap': 2 }) })
  const steps = [0, 1, 2, 3].map((i) => ({ service: 's' + i, label: 'l' + i, apply: (x) => { four.calls.push('s' + i + '.apply:' + x.index); if (i === 3) throw new Error('x') }, undo: (x) => { four.calls.push('s' + i + '.undo:' + x.index) } }))
  txr.begin({ id: 'long', steps })
  await txr.run({ id: 'long' })
  const st = txr.status({ id: 'long' })
  ok(st.evidence.trace.length === 2 && st.evidence.traceDropped === 5, 'trace cap: the trace is capped AND the dropped rows are counted')
  ok(st.evidence.trace.some((x) => x.ok === false && x.phase === 'apply'), 'trace cap: the FAILING row is never dropped (evidence first)')
  ok(st.evidence.trace[st.evidence.trace.length - 1].phase === 'undo', 'trace cap: the kept rows stay in chronological order')
}

// ── 10. evidence开关 + bus + read-only purity + determinism ───────────────────────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const tx = createTransaction({ clock: c.clock, bus, settings: S() })
  tx.begin({ id: 'tx-bus', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] })
  await tx.run({ id: 'tx-bus' })
  ok(bus.topics.includes('tx/committed') && bus.rows.some((x) => x.hook === 'tx/committed' && x.payload.id === 'tx-bus'), 'bus: tx/committed is declared and emitted')
  const broken = createTransaction({ clock: c.clock, bus: fakeBus({ throwOnEmit: true }), settings: S() })
  broken.begin({ id: 'tx-brk', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] })
  await broken.run({ id: 'tx-brk' })
  ok(broken.status().unwired['bus:tx/committed'] === 1, 'bus: a broken bus is a COUNTED wiring gap')
  const noEv = createTransaction({ clock: c.clock, settings: S({ 'vmu.tx.keepEvidence': false }) })
  noEv.begin({ id: 'tx-ne', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] })
  await noEv.run({ id: 'tx-ne' })
  ok(noEv.status({ id: 'tx-ne' }).evidence === null && noEv.status().keepEvidence === false, 'evidence: keepEvidence=false is honoured AND disclosed')

  const before = JSON.stringify(tx.list()) + '|' + JSON.stringify(tx.status()) + '|' + JSON.stringify(tx.history()) + '|' + JSON.stringify(tx.status({ id: 'tx-bus' }))
  for (let i = 0; i < 3; i++) { tx.list(); tx.status(); tx.history(); tx.status({ id: 'tx-bus' }) }
  const after = JSON.stringify(tx.list()) + '|' + JSON.stringify(tx.status()) + '|' + JSON.stringify(tx.history()) + '|' + JSON.stringify(tx.status({ id: 'tx-bus' }))
  ok(before === after, 'read-only: list/status/history never mutate the ledger')
  const build = () => { const cc = fakeClock(7); const x = createTransaction({ clock: cc.clock, settings: S() }); x.begin({ id: 'd', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] }); return x }
  const a = build(); const b = build()
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two ledgers agree on list()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two ledgers agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two ledgers agree on history()')
  ok(createTransaction({ clock: fakeClock(3).clock, settings: S() }).begin({ id: 't', steps: [{ service: 'a', apply: () => 1, undo: () => 1 }] }).now === 3, 'injected clock: beganAt comes from clock() only')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
  // task-179: this used to be `>= 1 || true` (always true). It now DRIVES a real refusal and pins the
  // exact grouped counts (a step without `undo` must be refused at begin).
  {
    const codesBefore = { ...tx.status().refusals }
    let code = null
    try { tx.begin({ id: 'tx-noundo', steps: [{ service: 'a', apply: () => 1 }] }) } catch (e) { code = e && e.code }
    const rf = tx.status().refusals
    const expected = Number(codesBefore[code] || 0) + 1
    const groupedTotal = Object.values(rf).reduce((s, n) => s + (Number(n) || 0), 0)
    ok(!!code && /^VMU_[A-Z0-9_]+$/.test(code) && rf[code] === expected && tx.status().refusalsTotal === groupedTotal,
      'refusals are grouped by named code with exact counts (' + code + '=' + rf[code] + ', total=' + tx.status().refusalsTotal + ')')
    ok(Object.keys(rf).every((c) => /^VMU_[A-Z0-9_]+$/.test(c) && Number.isInteger(rf[c]) && rf[c] >= 1),
      'every refusal key is a named code with a positive integer count (' + Object.keys(rf).join('|') + ')')
  }
  ok(tx.status({ id: 'tx-bus' }).transaction.settled === true, 'status: a committed transaction is settled')
}

console.log('=== VMU TRANSACTION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
