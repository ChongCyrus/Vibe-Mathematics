#!/usr/bin/env node
// vmu ALERTS — the guard for kernel/alerts.js (docs/21 §5.3 / §13 / §14).
//
// WHAT THIS PROVES
//   A. thresholds: fire when the comparison holds, stay quiet when it does not, and are `undecided`
//      (counted) when there are no samples — never a silent pass;
//   B. ALERT-LEVEL DEDUP: the same fingerprint does not notify twice inside `vmu.alerts.dedupWindowMs`,
//      yet the re-fire is STILL COUNTED on the alert (dedup ≠ discard);
//   C. SILENCE IS NOT DISCARD: alerts inside a window are counted, the summary falls due at `until`, and
//      `flush()` marks it delivered (and refuses while the window is still open);
//   D. inhibition NAMES its source (`VMU_ALERT_SUPPRESSED` + suppressedBy) and is counted;
//   E. escalation: too early ⇒ NAMED refusal carrying `escalateAfterMs`; then it escalates by level; an
//      acknowledged alert never escalates;
//   F. SLO: no samples ⇒ `undecided`; met/breached from real samples; an exhausted budget yields
//      `VMU_SLO_BUDGET_EXHAUSTED` and `guardChange` refuses H2 while allowing H0/H1; an exemption ⇒ `exempt`;
//   G. caps report DROPPED counts; the threshold cap is a named `VMU_RESOURCE_BUDGET` refusal with 当前值/上限;
//   H. zero mechanism: nothing declared ⇒ inert, nothing throws, the skip is COUNTED;
//   I. determinism: two identical instances fed the same inputs produce byte-identical status();
//   J. the metrics dependency is OPTIONAL and minimal: without it the module reads its own samples; with it
//      (snapshot/kpi) the readings come from the injected object, and a kpi with 0 samples is `undecided`.
import { createAlerts, ALERT_CODES, OPS, SLO_STATES, RUNBOOK, fingerprintOf } from '../vibe-math-vmu/kernel/alerts.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const throwsCode = (fn, code) => {
  try { fn(); return false } catch (e) { return e && e.code === code }
}
const codesOf = (e) => (e && e.code) || 'no-code'
/** A minimal injected metrics stub (the documented minimal interface). */
const fakeMetrics = (rows = {}, kpiImpl = null) => ({
  snapshot({ indicators = [] } = {}) {
    return { ok: true, indicators: indicators.map((name) => Object.assign({ name, count: 0, sum: 0, min: null, max: null, avg: null, last: null }, rows[name] || {})) }
  },
  kpi: kpiImpl || (() => ({ ok: true, samples: 0, actual: null, met: null })),
})

// ---- A. threshold firing / not firing / undecided --------------------------------------------------
{
  let now = 1000
  const a = createAlerts({ clock: () => now, settings: { 'vmu.alerts.thresholds': [{ id: 't-ref', metric: 'refusalRate', op: '>', threshold: 0.1, agg: 'avg', window: 0 }] } })
  const first = a.evaluate()
  ok(first.results[0].state === 'undecided' && first.results[0].fired === false,
    'A1: a threshold with no samples is undecided (counted), never a silent pass', JSON.stringify(first.results[0]))
  a.sample({ metric: 'refusalRate', value: 0.05 })
  const calm = a.evaluate()
  ok(calm.results[0].state === 'ok' && calm.results[0].notified === false, 'A2: below the threshold ⇒ no alert', JSON.stringify(calm.results[0]))
  now = 2000
  a.sample({ metric: 'refusalRate', value: 0.4 })
  const hot = a.evaluate()
  ok(hot.results[0].state === 'fired' && hot.results[0].notified === true, 'A3: above the threshold ⇒ fires and notifies', JSON.stringify(hot.results[0]))
  const st = a.status()
  ok(st.counters.evaluated === 3 && st.counters.undecided === 1 && st.counters.fired >= 1,
    'A4: evaluate/undecided/fired are all counted', JSON.stringify(st.counters))
  ok(OPS.includes('rate>') && SLO_STATES.includes('undecided'), 'A5: the operator and SLO-state vocabularies are exported')
}

// ---- B. dedup: no second notification, but the count still moves -----------------------------------
{
  let now = 5000
  const a = createAlerts({ clock: () => now, settings: { 'vmu.alerts.dedupWindowMs': 60000 } })
  const r1 = a.raise({ metric: 'failureRate', object: 'tools/set', code: 'VMU_NOT_PERMITTED' })
  now = 5010
  const r2 = a.raise({ metric: 'failureRate', object: 'tools/set', code: 'VMU_NOT_PERMITTED' })
  ok(r1.notified === true && r1.fingerprint === 'failureRate×tools/set×VMU_NOT_PERMITTED',
    'B1: the ALERT fingerprint is metric×object×code (NOT watcher×event×object)', r1.fingerprint)
  ok(r2.notified === false && r2.deduped === true && r2.alert.count === 2 && r2.alert.deduped === 1,
    'B2: inside the dedup window the re-fire is NOT notified but IS counted', JSON.stringify(r2.alert))
  now = 5000 + 60001
  const r3 = a.raise({ metric: 'failureRate', object: 'tools/set', code: 'VMU_NOT_PERMITTED' })
  ok(r3.notified === true, 'B3: after the dedup window the alert notifies again')
  const st = a.status()
  ok(st.counters.deduped === 1 && st.counters.fired === 3, 'B4: dedup and fire counters both moved', JSON.stringify(st.counters))
  ok(fingerprintOf({ metric: 'm', object: null, code: null }) === 'm×-×-', 'B5: missing object/code render as "-" in the fingerprint')
}

// ---- C. silence: counted, summary due, flushed (and refused while open) ----------------------------
{
  let now = 10000
  const a = createAlerts({ clock: () => now, settings: {} })
  const sil = a.silence({ id: 'maint-1', ms: 60000, reason: 'planned maintenance' })
  ok(sil.ok === true && sil.until === 70000, 'C1: a silence window opens until at+ms', JSON.stringify(sil))
  const r = a.raise({ metric: 'storage', object: null, code: null })
  ok(r.notified === false && r.silenced === true && r.code === ALERT_CODES.SILENCED && r.silencedBy === 'maint-1',
    'C2: inside the window the alert is SILENCED and NAMES the window', JSON.stringify(r))
  const sum1 = a.summaries()
  ok(sum1.summaries[0].counted === 1 && sum1.summaries[0].due === false,
    'C3: the window already counts the silenced alert (silence ≠ discard)', JSON.stringify(sum1.summaries[0]))
  ok(throwsCode(() => a.flush({ id: 'maint-1' }), 'VMU_STATE'), 'C4: flushing before `until` is a NAMED refusal')
  now = 70001
  const sum2 = a.summaries()
  ok(sum2.due === 1 && sum2.summaries[0].due === true && sum2.summaries[0].counted === 1,
    'C5: at `until` the catch-up summary falls due with its count', JSON.stringify(sum2.summaries[0]))
  const flushed = a.flush({ id: 'maint-1' })
  ok(flushed.delivered === true && flushed.counted === 1, 'C6: flush() delivers the summary', JSON.stringify(flushed))
  ok(a.summaries().due === 0 && a.status().counters.summariesDelivered === 1, 'C7: a delivered summary is no longer due and is counted')
  ok(throwsCode(() => a.flush({ id: 'nope' }), 'VMU_NO_SUCH_OBJECT'), 'C8: flushing an unknown window is a named refusal')
}

// ---- D. inhibition names its source ----------------------------------------------------------------
{
  const now = 20000
  const a = createAlerts({ clock: () => now, settings: {} })
  a.raise({ metric: 'storage', object: null, code: null })                       // the superior fault, stays open
  a.inhibit({ by: 'storage×-×-', targets: ['t-ref'] })
  a.declare({ id: 't-ref', metric: 'refusalRate', op: '>', threshold: 0.1 })
  a.sample({ metric: 'refusalRate', value: 0.9 })
  const e = a.evaluate()
  ok(e.results[0].suppressed === true && e.results[0].notified === false,
    'D1: an open superior alert suppresses the inferior threshold alert', JSON.stringify(e.results[0]))
  const rec = a.status().openAlerts.find((x) => x.fingerprint === 'refusalRate×-×-')
  ok(!!rec && rec.suppressed === 1, 'D2: the suppression is COUNTED on the inferior alert', JSON.stringify(rec))
  const viaRaise = a.raise({ metric: 'refusalRate', object: null, code: null, thresholdId: 't-ref' })
  ok(viaRaise.suppressed === true && viaRaise.code === ALERT_CODES.SUPPRESSED && viaRaise.suppressedBy === 'storage×-×-',
    'D3: the suppression NAMES its source (a refusal that cannot name its suppressor is useless)', JSON.stringify(viaRaise))
}

// ---- E. escalation ---------------------------------------------------------------------------------
{
  let now = 30000
  const a = createAlerts({ clock: () => now, settings: { 'vmu.alerts.escalateAfterMs': 1000, 'vmu.alerts.channels': ['#ops', '#oncall'] } })
  a.raise({ metric: 'failureRate', object: null, code: null })
  ok(throwsCode(() => a.escalate({ id: 'failureRate×-×-' }), 'VMU_STATE'),
    'E1: escalating before escalateAfterMs is a NAMED refusal')
  try { a.escalate({ id: 'failureRate×-×-' }) } catch (e) {
    ok(/escalateAfterMs=1000/.test(String(e.hint || '')), 'E2: the refusal names the window it is waiting for', e.hint)
  }
  now = 30001 + 1000
  const esc = a.escalate({ id: 'failureRate×-×-' })
  ok(esc.ok === true && esc.level === 1 && esc.channel === '#oncall', 'E3: after the window it escalates to the next layer', JSON.stringify(esc))
  now += 5000
  a.raise({ metric: 'failureRate', object: null, code: null, at: now })
  now += 5000
  ok(a.escalate({ id: 'failureRate×-×-' }).level === 2, 'E4: escalation level increases')
  a.acknowledge({ id: 'failureRate×-×-' })
  ok(throwsCode(() => a.escalate({ id: 'failureRate×-×-' }), 'VMU_STATE'), 'E5: an acknowledged alert never escalates')
  ok(throwsCode(() => a.escalate({ id: 'nope×-×-' }), 'VMU_NO_SUCH_OBJECT'), 'E6: escalating an unknown alert is a named refusal')
  const due = a.evaluate()
  ok(Array.isArray(due.escalationDue), 'E7: evaluate() reports the escalation-due list')
}

// ---- F. SLO: three-valued, exhaustion, guardChange, exemption --------------------------------------
{
  let now = 40000
  const slo = [{ id: 'settle-success', metric: 'settleSuccess', op: '>=', target: 0.99, window: 0, agg: 'avg' }]
  const a = createAlerts({ clock: () => now, settings: { 'vmu.slo.targets': slo } })
  const und = a.budget({ sli: 'settle-success' })
  ok(und.state === 'undecided' && und.exhausted === null && und.usedFraction === null,
    'F1: an SLO with no samples is undecided (not a pass)', JSON.stringify(und))
  a.sample({ metric: 'settleSuccess', value: 1 })
  const met = a.budget({ sli: 'settle-success' })
  ok(met.state === 'met' && met.exhausted === false, 'F2: samples at/above the target ⇒ met', JSON.stringify(met))
  now += 10
  a.sample({ metric: 'settleSuccess', value: 0.5 })
  const br = a.budget({ sli: 'settle-success' })
  ok(br.state === 'breached' && br.exhausted === true && br.code === ALERT_CODES.BUDGET_EXHAUSTED,
    'F3: a breach that consumes the whole budget is exhausted and carries the budget code', JSON.stringify(br))
  const guardH2 = a.guardChange({ sli: 'settle-success', hot: 'H2' })
  ok(guardH2.ok === false && guardH2.refused === true && guardH2.code === ALERT_CODES.BUDGET_EXHAUSTED,
    'F4: an exhausted budget REFUSES an H2 change by name', JSON.stringify(guardH2))
  const guardH1 = a.guardChange({ sli: 'settle-success', hot: 'H1' })
  ok(guardH1.ok === true && guardH1.refused === false, 'F5: H0/H1 firefighting is allowed during exhaustion', JSON.stringify(guardH1))
  ok(throwsCode(() => a.budget({ sli: 'nope' }), 'VMU_NO_SUCH_OBJECT'), 'F6: an unknown SLI is a named refusal')
  const exempt = createAlerts({ clock: () => now, settings: { 'vmu.slo.targets': slo, 'vmu.slo.exemptions': [{ sli: 'settle-success', from: 0, to: 999999, reason: 'planned drill' }] } })
  const ex = exempt.budget({ sli: 'settle-success' })
  ok(ex.state === 'exempt' && ex.exemptReason === 'planned drill' && ex.exhausted === false,
    'F7: an active exemption is an explicit state carrying its reason (never a silent pass)', JSON.stringify(ex))
}

// ---- G. caps and counted drops ---------------------------------------------------------------------
{
  const now = 50000
  const a = createAlerts({ clock: () => now, settings: { 'vmu.alerts.maxSamples': 3, 'vmu.alerts.maxThresholds': 2 } })
  for (let i = 0; i < 5; i++) a.sample({ metric: 'm', value: i })
  const st = a.status()
  ok(st.samplesTotal === 3 && st.dropped.samples.m === 2 && st.dropped.total === 2,
    'G1: the sample ring counts what it DROPPED (never silent)', JSON.stringify(st.dropped))
  a.declare({ id: 'a1', metric: 'm', op: '>', threshold: 1 })
  a.declare({ id: 'a2', metric: 'm', op: '>', threshold: 1 })
  ok(throwsCode(() => a.declare({ id: 'a3', metric: 'm', op: '>', threshold: 1 }), 'VMU_RESOURCE_BUDGET'),
    'G2: exceeding maxThresholds is a named VMU_RESOURCE_BUDGET refusal')
  try { a.declare({ id: 'a3', metric: 'm', op: '>', threshold: 1 }) } catch (e) {
    ok(/\(2\/2\)/.test(String(e.message)) && /maxThresholds/.test(String(e.hint || '')),
      'G3: the refusal names 当前值/上限 and the key that raises it', e.message + ' | ' + e.hint)
  }
  ok(a.status().dropped.alerts >= 2, 'G4: the rejected declaration is counted as a drop')
  ok(throwsCode(() => a.declare({ id: 'a1', metric: 'OTHER', op: '>', threshold: 1 }), 'VMU_CONFLICT'),
    'G5: re-declaring an id with different fields is a NAMED conflict')
  ok(a.declare({ id: 'a1', metric: 'm', op: '>', threshold: 1 }).deduped === true, 'G6: an identical re-declaration is idempotent')
}

// ---- H. zero mechanism -----------------------------------------------------------------------------
{
  const a = createAlerts({ clock: () => 0 })
  const st = a.status()
  ok(st.configured === false && st.thresholds.length === 0 && st.openAlerts.length === 0,
    'H1: with nothing declared the module is inert')
  ok(st.counters.skips >= 1, 'H2: the unconfigured skip is COUNTED (docs/21 §4.3 #1)', JSON.stringify(st.counters))
  const e = a.evaluate()
  ok(e.ok === true && e.evaluated === 0 && e.results.length === 0, 'H3: evaluating nothing throws nothing')
  ok(a.runbook({ id: 'R6' }).entries[0].id === 'R6', 'H4: the runbook is available without any configuration', JSON.stringify(RUNBOOK.length))
  ok(createAlerts({ clock: () => 0 }).status().refusalsTotal === 0, 'H5: a fresh instance has no refusals')
}

// ---- I. determinism --------------------------------------------------------------------------------
{
  const seq = (a) => {
    a.declare({ id: 'd1', metric: 'm', op: '>', threshold: 1 })
    a.sample({ metric: 'm', value: 5, at: 100 })
    a.raise({ metric: 'x', object: 'o', code: null, at: 100 })
    a.silence({ id: 's1', ms: 10, reason: 'r', at: 100 })
    a.raise({ metric: 'x', object: 'o', code: null, at: 105 })
    a.evaluate({ at: 110 })
    return JSON.stringify(a.status())
  }
  const one = seq(createAlerts({ clock: () => 999 }))
  const two = seq(createAlerts({ clock: () => 999 }))
  ok(one === two, 'I1: two identical instances fed the same inputs produce byte-identical status()')
  const a = createAlerts({ clock: () => 1 })
  a.raise({ metric: 'k', object: null, code: null, at: 1 })
  const before = JSON.stringify(a.status())
  a.status(); a.summaries(); a.runbook({ id: 'R1' })
  ok(JSON.stringify(a.status()) === before, 'I2: READ paths (status/summaries/runbook) do not mutate recorded data')
}

// ---- J. the optional metrics dependency ------------------------------------------------------------
{
  const now = 60000
  const a = createAlerts({ clock: () => now, settings: { 'vmu.alerts.thresholds': [{ id: 't1', metric: 'failureRate', op: '>', threshold: 0.2 }] } })
  const noMetrics = a.evaluate()
  ok(noMetrics.results[0].source === 'local' && noMetrics.results[0].state === 'undecided',
    'J1: without metrics the module reads its OWN samples (and is undecided with none)', JSON.stringify(noMetrics.results[0]))
  const withMetrics = createAlerts({
    clock: () => now,
    settings: { 'vmu.alerts.thresholds': [{ id: 't1', metric: 'failureRate', op: '>', threshold: 0.2 }] },
    metrics: fakeMetrics({ failureRate: { count: 4, sum: 1.2, avg: 0.3, min: 0.1, max: 0.5, last: 0.5 } }),
  })
  const fromMetrics = withMetrics.evaluate()
  ok(fromMetrics.results[0].source === 'metrics' && fromMetrics.results[0].state === 'fired',
    'J2: with an injected metrics object the reading comes from it', JSON.stringify(fromMetrics.results[0]))
  const kpiUndecided = createAlerts({
    clock: () => now,
    settings: { 'vmu.slo.targets': [{ id: 's1', metric: 'failureRate', op: '<=', target: 0.1 }] },
    metrics: fakeMetrics({}, () => ({ ok: true, samples: 0, actual: null, met: null })),
  }).budget({ sli: 's1' })
  ok(kpiUndecided.state === 'undecided', 'J3: a metrics.kpi() with 0 samples stays undecided', JSON.stringify(kpiUndecided))
  const rateOne = createAlerts({ clock: () => now, settings: { 'vmu.alerts.thresholds': [{ id: 'r', metric: 'm', op: 'rate>', threshold: 1 }] } })
  rateOne.sample({ metric: 'm', value: 5 })
  const rate = rateOne.evaluate()
  ok(rate.results[0].state === 'undecided' && /two local samples/.test(rate.results[0].reason),
    'J4: a rate threshold with one sample is undecided (no guessed arithmetic)', JSON.stringify(rate.results[0]))
  const r2 = rateOne
  r2.sample({ metric: 'm', value: 9 })
  const fired = r2.evaluate()
  ok(fired.results[0].state === 'fired' && fired.results[0].actual === 4,
    'J5: with two samples the rate is last-vs-previous', JSON.stringify(fired.results[0]))
}

// ---- K. runbook + refusal accounting ---------------------------------------------------------------
{
  const a = createAlerts({ clock: () => 0 })
  const r6 = a.runbook({ code: 'VMU_STORE_FAILED' })
  ok(r6.entries.length === 1 && r6.entries[0].id === 'R6' && r6.entries[0].steps.length >= 3,
    'K1: a runbook entry is found by the JUDGEMENT code and carries ordered steps + acceptance', JSON.stringify(r6.entries[0]).slice(0, 120))
  ok(throwsCode(() => a.runbook({ code: 'VMU_NOT_A_REAL_CODE' }), 'VMU_NO_SUCH_OBJECT'),
    'K2: an unknown code is a named refusal (with the known-code hint)')
  ok(throwsCode(() => a.runbook({}), 'VMU_INVALID_ARGUMENT'), 'K3: runbook() with no argument is a named refusal')
  ok(a.status().refusals.VMU_NO_SUCH_OBJECT >= 1 && a.status().refusalsTotal >= 2,
    'K4: every refusal is COUNTED BY CODE before it is thrown', JSON.stringify(a.status().refusals))
}

if (failed === 0) {
  console.log('=== VMU ALERTS: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU ALERTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
