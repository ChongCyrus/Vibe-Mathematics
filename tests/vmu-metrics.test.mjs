// Independent test for vmu kernel · metrics (no dependency on kernel/index.js).
// Spec source: docs/21-observability-and-operations.md §1 (three layers) / §4 (indicators + the three counting
// disciplines) / §15 (explainability).
// Run: node tests/vmu-metrics.test.mjs     Last line: === VMU METRICS: N passed, M failed ===
import { createMetrics, refuse, METRIC_CATALOGUE, NEVER_SAMPLED_KINDS } from '../vibe-math-vmu/kernel/metrics.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 1000) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus() { const rows = []; return { rows, emit: (e) => { rows.push(e) } } }
const DECLARED = { 'vmu.metrics.indicators': ['throughput', 'refusalRate'] }

// ── 1. zero mechanism (unconfigured ⇒ empty, non-throwing, and the skip is COUNTED) ───────────────
{
  const c = fakeClock(1000)
  const log = fakeLog()
  const m = createMetrics({ clock: c.clock, log })
  const s = m.snapshot()
  ok(s.ok === true && s.configured === false && s.indicators.length === 0 && s.count === 0, 'zero-mechanism: snapshot() is empty and does not throw')
  ok(m.status().configured === false && m.status().indicators.length === 0, 'zero-mechanism: status().configured=false')
  const o = m.observe({ name: 'throughput', value: 1, by: 'test' })
  ok(o.ok === true && o.recorded === false && /zero mechanism/.test(String(o.reason)), 'zero-mechanism: observe is SKIPPED (not recorded) with a stated reason')
  ok(m.counters().skippedTotal === 1 && m.counters().skips.unconfigured === 1, 'zero-mechanism: the skip is counted (skips.unconfigured=1)')
  ok(log.rows.some((r) => r.type === 'metrics/skipped'), 'zero-mechanism: the skip also reaches the audit log (never silent)')
  const ser = m.series({ name: 'throughput' })
  ok(ser.ok === true && ser.count === 0 && ser.unavailable === true, 'zero-mechanism: series() is empty, marked unavailable, does not throw')
  ok(m.counters().observedTotal === 0, 'zero-mechanism: nothing was observed')
}

// ── 2. observe + snapshot aggregation (deterministic values, provenance included) ──────────────────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  m.observe({ name: 'throughput', value: 2, at: 10, by: 'tools/task', source: 'vmu.tasks' })
  m.observe({ name: 'throughput', value: 4, at: 20, by: 'tools/task', source: 'vmu.tasks' })
  m.observe({ name: 'throughput', value: 6, at: 30, by: 'meeting/open', source: 'kernel.meeting' })
  const s = m.snapshot()
  const t = s.indicators.find((x) => x.name === 'throughput')
  ok(t.count === 3 && t.sum === 12 && t.min === 2 && t.max === 6 && t.avg === 4 && t.last === 6, 'snapshot: count/sum/min/max/avg/last are exact')
  ok(t.firstAt === 10 && t.lastAt === 30, 'snapshot: firstAt/lastAt come from the observations')
  ok(t.by.join(',') === 'meeting/open,tools/task' && t.sources.length === 2, 'snapshot: provenance (who + source) is aggregated and sorted')
  ok(m.status().observedTotal === 3, 'status: observedTotal counts every recorded row')
  ok(METRIC_CATALOGUE.includes('refusalRate') && METRIC_CATALOGUE.length === 12, 'catalogue: the 12 documented indicators are exported (docs/21 §4.1)')
}

// ── 3. discipline ① NOTHING IS SILENTLY DROPPED (ring cap + series() limit both report `dropped`) ──
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createMetrics({ clock: c.clock, log, settings: Object.assign({ 'vmu.metrics.seriesCap': 2 }, DECLARED) })
  for (let i = 1; i <= 5; i++) m.observe({ name: 'throughput', value: i, at: i, by: 'test' })
  const cnt = m.counters()
  ok(cnt.dropped.throughput === 3 && cnt.droppedTotal === 3, 'discipline①: the ring cap drops the OLDEST row and counts it (dropped.throughput=3)')
  ok(log.rows.filter((r) => r.type === 'metrics/dropped').length === 3, 'discipline①: each drop is written to the audit log (never silent)')
  const st = m.status()
  ok(st.seriesCap === 2 && st.droppedTotal === 3, 'status: the cap itself is self-reported (seriesCap=2)')
  const all = m.series({ name: 'throughput' })
  ok(all.count === 2 && all.available === 2 && all.dropped === 0 && all.truncated === false, 'discipline①: series() under the cap reports no truncation')
  const capped = m.series({ name: 'throughput', limit: 1 })
  ok(capped.count === 1 && capped.available === 2 && capped.dropped === 1 && capped.truncated === true, 'discipline①: series(limit) reports the DROPPED count (1)')
  const lastRows = capped.items.map((r) => r.value)
  ok(lastRows.join(',') === '5', 'series(): keeps the most recent rows')
}

// ── 4. discipline ② EVERY COUNT IS EXPLAINABLE (who recorded it, when, and the composing rows) ────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  m.observe({ name: 'throughput', value: 1, at: 100, by: 'alpha', source: 's1' })
  m.observe({ name: 'throughput', value: 3, at: 200, by: 'beta', source: 's2' })
  const ex = m.explain({ name: 'throughput' })
  ok(ex.ok === true && ex.count === 2 && ex.rows.length === 2, 'discipline②: explain() lists the rows that compose the number')
  ok(ex.rows[0].by === 'alpha' && ex.rows[0].at === 100 && ex.rows[1].by === 'beta', 'discipline②: each row names WHO (`by`) and WHEN (`at`)')
  ok(ex.by.join(',') === 'alpha,beta' && ex.firstAt === 100 && ex.lastAt === 200, 'discipline②: explain() summarises the provenance window')
  throwsNamed(() => m.observe({ name: 'throughput', value: 1, by: 42 }), 'VMU_INVALID_ARGUMENT', 'discipline②: an unnamed recorder is refused by name')
  throwsNamed(() => m.explain({}), 'VMU_INVALID_ARGUMENT', 'explain: needs a name or a code (named refusal)')
}

// ── 5. refusal accounting: grouped by VMU_* code + explainable per code (docs/21 §4.3 #1) ─────────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  throwsNamed(() => m.observe({ name: 'throughput', value: 'nope' }), 'VMU_INVALID_ARGUMENT', 'refusals: non-numeric value refused')
  throwsNamed(() => m.observe({ name: 'throughput', value: NaN }), 'VMU_INVALID_ARGUMENT', 'refusals: NaN refused')
  throwsNamed(() => m.observe({ name: 'nope', value: 1 }), 'VMU_METRIC_UNAVAILABLE', 'refusals: indicator outside vmu.metrics.indicators refused by name')
  throwsNamed(() => m.observe({ name: '', value: 1 }), 'VMU_INVALID_ARGUMENT', 'refusals: empty name refused')
  throwsNamed(() => m.observe({ name: 'throughput', value: 1, at: 'not-a-date' }), 'VMU_INVALID_ARGUMENT', 'refusals: unparseable `at` refused')
  const cnt = m.counters()
  ok(cnt.refusals.VMU_INVALID_ARGUMENT === 4 && cnt.refusals.VMU_METRIC_UNAVAILABLE === 1, 'refusals: counted BY CODE (4 + 1)')
  ok(cnt.refusalsTotal === 5, 'refusals: the total equals the sum of the code groups (docs/21 §15.2 #1)')
  const ex = m.explain({ code: 'VMU_INVALID_ARGUMENT' })
  ok(ex.kind === 'refusals' && ex.count === 4 && ex.rows.length === 4, 'refusals: explain(code) lists the composing refusal rows')
  ok(ex.rows.every((r) => typeof r.message === 'string' && r.at === 0), 'refusals: each refusal row carries a message and the injected time')
}

// ── 6. discipline ③ SAMPLING SELF-DISCLOSES (+ change/refusal/settlement are NEVER sampled) ───────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: { 'vmu.metrics.indicators': ['throughput'], 'vmu.metrics.sampleHighVolume': true, 'vmu.metrics.sampleRate': 0.5 } })
  const recs = []
  for (let i = 1; i <= 4; i++) recs.push(m.observe({ name: 'throughput', value: i, at: i, by: 'probe' }))
  ok(recs[0].recorded === false && recs[0].sampledOut === true && /stride/.test(recs[0].reason), 'discipline③: an unsampled read says so (sampledOut + stride reason)')
  ok(recs[1].recorded === true && recs[1].sampled === true && recs[1].sampleRate === 0.5, 'discipline③: a sampled row carries sampled:true + the rate')
  const snap = m.snapshot()
  ok(snap.sampled.enabled === true && snap.sampled.rate === 0.5 && snap.sampled.stride === 2, 'discipline③: snapshot() self-discloses the sampling regime')
  ok(snap.sampled.sampledOut.throughput === 2 && snap.indicators[0].sampled === 2 && snap.indicators[0].unsampled === 0, 'discipline③: rows not sampled are COUNTED (2), recorded rows are all sampled')
  ok(m.counters().sampledOutTotal === 2 && m.status().sampling.enabled === true, 'discipline③: counters/status expose the sampling loss')
  const before = m.series({ name: 'throughput' }).count
  for (const kind of ['change', 'refusal', 'settlement']) m.observe({ name: 'throughput', value: 9, at: 99, by: 'engine', kind })
  const after = m.series({ name: 'throughput' })
  ok(after.count === before + 3, 'discipline③: change/refusal/settlement rows are NEVER sampled (all 3 recorded)')
  ok(after.items.slice(-3).every((r) => r.sampled === false && r.sampleRate === 0), 'discipline③: those rows report sampled:false')
  m.observe({ name: 'throughput', value: 7, at: 100, by: 'engine', kind: 'change', sampled: true })
  const forced = m.series({ name: 'throughput' }).items.slice(-1)[0]
  ok(forced.sampled === false && forced.sampleOverrideIgnored === true, 'discipline③: a sampling request on a change is IGNORED and disclosed (sampleOverrideIgnored)')
  ok(NEVER_SAMPLED_KINDS.includes('settlement') && NEVER_SAMPLED_KINDS.includes('refusal'), 'never-sampled kinds are exported')
}

// ── 7. allowTrigger=false ⇒ any trigger is refused BY NAME (and counted) ─────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const m = createMetrics({ clock: c.clock, bus, settings: DECLARED })
  const e = throwsNamed(() => m.trigger({ name: 'kpi/slo-breach' }), 'VMU_METRICS_TRIGGER_FORBIDDEN', 'allowTrigger=false: trigger refused by name')
  ok(!!e && /read-only/.test(e.message) && /allowTrigger/.test(String(e.hint)), 'allowTrigger=false: the refusal explains why (read-only + the setting)')
  ok(m.counters().refusals.VMU_METRICS_TRIGGER_FORBIDDEN === 1, 'allowTrigger=false: the refused trigger is counted by code')
  ok(bus.rows.length === 0, 'allowTrigger=false: nothing was emitted')
  throwsNamed(() => m.trigger({}), 'VMU_INVALID_ARGUMENT', 'allowTrigger=false: a nameless trigger is still refused by name')
}

// ── 8. allowTrigger=true ⇒ advisory hook only, and NO state mutation ─────────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const m = createMetrics({ clock: c.clock, bus, settings: Object.assign({ 'vmu.metrics.allowTrigger': true }, DECLARED) })
  m.observe({ name: 'throughput', value: 1, at: 5, by: 'test' })
  const before = JSON.stringify(m.status()) + '|' + JSON.stringify(m.counters()) + '|' + JSON.stringify(m.snapshot())
  const r = m.trigger({ name: 'kpi/slo-breach', payload: { indicator: 'refusalRate' } })
  ok(r.ok === true && r.triggered === true && r.hook.type === 'metrics/trigger', 'allowTrigger=true: the trigger returns an advisory hook')
  ok(bus.rows.length === 1 && bus.rows[0].payload.indicator === 'refusalRate', 'allowTrigger=true: the hook reached the (advisory) bus')
  const after = JSON.stringify(m.status()) + '|' + JSON.stringify(m.counters()) + '|' + JSON.stringify(m.snapshot())
  ok(before === after, 'allowTrigger=true: triggering mutated NO metric state (status/counters/snapshot identical)')
}

// ── 9. read-only purity: repeated reads are byte-identical (valid input) ──────────────────────────
{
  const c = fakeClock(7)
  const m = createMetrics({ clock: c.clock, settings: Object.assign({ 'vmu.metrics.windowMs': 100 }, DECLARED) })
  m.observe({ name: 'throughput', value: 1, at: 7, by: 'a' })
  m.observe({ name: 'refusalRate', value: 0.5, at: 7, by: 'b' })
  const s1 = JSON.stringify(m.snapshot()); const c1 = JSON.stringify(m.counters()); const st1 = JSON.stringify(m.status())
  const x1 = m.export().body; const e1 = JSON.stringify(m.explain({ name: 'throughput' })); const r1 = JSON.stringify(m.series({ name: 'throughput' }))
  for (let i = 0; i < 3; i++) { m.snapshot(); m.counters(); m.status(); m.export(); m.explain({ name: 'throughput' }); m.series({ name: 'throughput' }) }
  ok(JSON.stringify(m.snapshot()) === s1 && JSON.stringify(m.counters()) === c1 && JSON.stringify(m.status()) === st1, 'read-only: snapshot/counters/status are stable across repeated reads')
  ok(m.export().body === x1 && JSON.stringify(m.explain({ name: 'throughput' })) === e1 && JSON.stringify(m.series({ name: 'throughput' })) === r1, 'read-only: export/explain/series are stable across repeated reads')
}

// ── 10. determinism: same settings + same injected clock ⇒ byte-identical output ─────────────────
{
  const build = () => {
    const c = fakeClock(50)
    const m = createMetrics({ clock: c.clock, settings: { 'vmu.metrics.indicators': ['throughput', 'refusalRate'], 'vmu.metrics.seriesCap': 3, 'vmu.metrics.sampleHighVolume': true, 'vmu.metrics.sampleRate': 0.5 } })
    for (let i = 1; i <= 6; i++) m.observe({ name: 'throughput', value: i, at: 50 + i, by: 'gen', source: 'test' })
    m.observe({ name: 'refusalRate', value: 0.25, at: 60, by: 'gen', kind: 'refusal' })
    return m
  }
  const a = build(); const b = build()
  ok(JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()), 'determinism: two instances agree on snapshot()')
  ok(JSON.stringify(a.counters()) === JSON.stringify(b.counters()), 'determinism: two instances agree on counters()')
  ok(a.export({ format: 'jsonl' }).body === b.export({ format: 'jsonl' }).body, 'determinism: two instances agree byte-for-byte on jsonl export')
  const allAt = a.explain({ name: 'throughput' }).rows.map((r) => r.at)
  ok(allAt.every((x) => x >= 51 && x <= 56), 'determinism: every timestamp comes from the observations (no real clock read)')
}

// ── 11. window filtering uses only the injected clock ────────────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: Object.assign({ 'vmu.metrics.windowMs': 1000 }, DECLARED) })
  m.observe({ name: 'throughput', value: 1, at: 0, by: 't' })
  m.observe({ name: 'throughput', value: 2, at: 1000, by: 't' })
  m.observe({ name: 'throughput', value: 3, at: 2000, by: 't' })
  c.advance(2000) // now = 2000
  const win = m.snapshot()
  const winT = win.indicators.find((x) => x.name === 'throughput')
  ok(win.windowMs === 1000 && winT.count === 2 && winT.sum === 5, 'window: default vmu.metrics.windowMs filters by the injected clock (rows at 1000,2000)')
  const all = m.snapshot({ window: 0 })
  ok(all.indicators.find((x) => x.name === 'throughput').count === 3, 'window: window=0 means "everything"')
  const wide = m.snapshot({ window: 5000 })
  ok(wide.indicators.find((x) => x.name === 'throughput').count === 3, 'window: a wider window includes everything')
  ok(m.snapshot({ indicators: ['throughput'] }).indicators.length === 1, 'window: an explicit indicator filter narrows the snapshot')
}

// ── 12. exportFormat (json | jsonl) + unsupported format ⇒ named refusal ─────────────────────────
{
  const c = fakeClock(0)
  const j = createMetrics({ clock: c.clock, settings: Object.assign({ 'vmu.metrics.exportFormat': 'jsonl' }, DECLARED) })
  j.observe({ name: 'throughput', value: 1, at: 1, by: 't' })
  j.observe({ name: 'refusalRate', value: 2, at: 2, by: 't' })
  const jsonl = j.export()
  ok(jsonl.format === 'jsonl' && jsonl.lines === 2 && jsonl.body.split('\n').length === 2, 'export: the documented format (jsonl) is honoured, one row per line')
  const json = j.export({ format: 'json' })
  ok(json.format === 'json' && JSON.parse(json.body).snapshot.observations === 2, 'export: json is parseable and carries the snapshot')
  throwsNamed(() => j.export({ format: 'xml' }), 'VMU_INVALID_ARGUMENT', 'export: an unsupported format is refused by name')
  ok(j.counters().refusals.VMU_INVALID_ARGUMENT === 1, 'export: the refused format is counted')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

// ── 13. the module never depends on real time or randomness (source-level guarantee) ─────────────
{
  const c = fakeClock(3)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  m.observe({ name: 'throughput', value: 1, by: 't' })
  const r = m.observe({ name: 'throughput', value: 2, by: 't' })
  ok(r.at === 3, 'injected clock: observe() timestamps come from clock() only')
  ok(m.snapshot().at === 3 && m.counters().at === 3 && m.status().at === 3, 'injected clock: every read path timestamps from clock() only')
}

// ── 14. KPI evaluation is decidable and THREE-VALUED (docs/21 §4.2) ──────────────────────────────
{
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  const undecided = m.kpi({ name: 'refusalRate', op: '<=', target: 0.1 })
  ok(undecided.ok === true && undecided.met === null && undecided.samples === 0 && /undecided/.test(undecided.reason), 'kpi: no samples ⇒ met=null (undecided, not a silent pass)')
  m.observe({ name: 'refusalRate', value: 0.2, at: 10, by: 't' })
  m.observe({ name: 'refusalRate', value: 0.4, at: 20, by: 't' })
  const bad = m.kpi({ name: 'refusalRate', op: '<=', target: 0.25 })
  ok(bad.met === false && bad.actual === 0.3 && bad.agg === 'avg' && bad.samples === 2, 'kpi: average over the window decides (<=(0.25) is unmet at 0.3)')
  ok(m.kpi({ name: 'refusalRate', op: '<=', target: 0.3 }).met === true, 'kpi: boundary is inclusive for <=')
  ok(m.kpi({ name: 'refusalRate', op: '>', target: 0.35, agg: 'max' }).met === true, 'kpi: agg=max is honoured (0.4 > 0.35)')
  ok(m.kpi({ name: 'refusalRate', op: '==', target: 2, agg: 'count' }).met === true, 'kpi: agg=count is honoured (2 samples == 2)')
  throwsNamed(() => m.kpi({ name: 'refusalRate', op: '~', target: 1 }), 'VMU_INVALID_ARGUMENT', 'kpi: an unsupported operator is refused by name')
  throwsNamed(() => m.kpi({ name: 'refusalRate', target: 'soon' }), 'VMU_INVALID_ARGUMENT', 'kpi: a non-numeric target is refused by name')
  throwsNamed(() => m.kpi({ name: 'refusalRate', target: 1, agg: 'median' }), 'VMU_INVALID_ARGUMENT', 'kpi: an unsupported aggregate is refused by name')
  ok(m.counters().refusals.VMU_INVALID_ARGUMENT === 3, 'kpi: every refused KPI is counted by code')
}

// ── 15. wiring gaps are COUNTED, never invisible (docs/21 §4.3 #3) ───────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createMetrics({ clock: c.clock, log, settings: DECLARED })
  const r = m.noteUnwired({ name: 'hook:budget/exceeded', reason: 'no producer' })
  ok(r.ok === true && r.count === 1, 'unwired: a wiring gap can be reported and counted')
  m.noteUnwired({ name: 'hook:budget/exceeded', reason: 'no producer' })
  m.noteUnwired({ name: 'tool:vibe_vmu_explain', reason: 'planned' })
  ok(m.counters().unwired['hook:budget/exceeded'] === 2 && m.counters().unwiredTotal === 3, 'unwired: grouped per name, total = 3')
  ok(m.status().unwiredTotal === 3, 'unwired: status() exposes the total')
  ok(log.rows.filter((x) => x.type === 'metrics/unwired').length === 3, 'unwired: each report reaches the audit log')
  throwsNamed(() => m.noteUnwired({}), 'VMU_INVALID_ARGUMENT', 'unwired: a nameless gap is refused by name')
}

// task-238 (sentinel convergence): `NaN` is the kernel's ONLY "cannot interpret" sentinel — this face used to
// return `null` from its own parser, which was one of the three disagreeing faces. The refusal naming is now
// checked here (the code path was already refused; what was missing was the received value + one sentinel).
{
  const { ms } = await import('../vibe-math-vmu/kernel/timevalue.js')
  const c = fakeClock(0)
  const m = createMetrics({ clock: c.clock, settings: DECLARED })
  const e = throwsNamed(() => m.observe({ name: 'throughput', value: 1, at: 'not-a-date' }), 'VMU_INVALID_ARGUMENT', 'unparseable `at` ⇒ named refusal (shared ms() + Number.isFinite)')
  ok(!!e && String(e.hint).includes('not-a-date'), 'the refusal NAMES the received value')
  throwsNamed(() => m.observe({ name: 'throughput', value: 1, at: NaN }), 'VMU_INVALID_ARGUMENT', 'a NaN instant is refused too (NaN is the one sentinel)')
  ok(m.observe({ name: 'throughput', value: 1, at: 0 }).ok === true, 'control: at 0 is still accepted (epoch 0 is a legal instant)')
  ok(Number.isNaN(ms('nope')) && Number.isNaN(ms(NaN)) && ms(0) === 0, 'control: the shared entry point keeps NaN as its sentinel and 0 as a legal instant')
}

console.log('=== VMU METRICS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
