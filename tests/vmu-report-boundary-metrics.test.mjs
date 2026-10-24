// vibe-math-vmu — ROUND 19 / task-121 ①: a `threshold` report CAN fire autonomously, because the TURN BOUNDARY
// now hands `report.tick()` the metrics the kernel really counted.
// Run: `node tests/vmu-report-boundary-metrics.test.mjs` (last line `=== VMU R19 BOUNDARY METRICS: N passed, M failed ===`).
//
// WHY THIS SUITE EXISTS (R18 measured the defect on a real host): the entry bridges the host's
// `agent/turn-stopping` into `report.tick({ at, event:'turn-end' })`. It used to pass NO `metrics`, and
// `kernel/report.js`'s `thresholdMet()` returns false for a missing object ON PURPOSE — "no data" must never
// become a fire. So `event`/`period` reports fired by themselves while a `threshold` report could only fire when
// a caller hand-fed it numbers. The fix is on the FRAMEWORK side (hand over what was really counted), NOT in
// `thresholdMet()` (which is left exactly as it was, and this suite proves the difference).
//
// THE FOUR THINGS GRADED:
//   ① the OLD shape (a tick with no metrics) still fires NOTHING threshold-shaped  — the defect, reproduced;
//   ② a declared-but-unobserved indicator is ABSENT (never a fabricated 0)         — the red line;
//   ③ REAL observations ⇒ the boundary tick fires the ABOVE-line report by itself  — the fix;
//   ④ ★ IN THE SAME DEPLOYMENT the BELOW-line report stays SILENT for the whole run — the adversarial half
//      (without it, "it fired" could just mean "everything fires").
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as entryMod from '../vibe-math-vmu/vibe-math-vmu.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
}
const J = (o) => JSON.stringify(o)

// A fake host ctx that CAPTURES the listeners the entry registers, so the suite can EMIT the host's own
// turn-boundary event instead of calling `report.tick()` by hand. That distinction is the whole point: the
// assertion must be about the ENTRY's own bridge, not about a call the test made.
const listeners = {}
const ctx = {
  effect: (fn) => fn(),
  on: (name, l) => { (listeners[name] = listeners[name] || []).push(l); return () => {} },
  tools: { register: async () => () => {} },
}

const root = await mkdtemp(join(tmpdir(), 'vmu-r19-boundary-'))
await (async () => {
  const sink = []
  const handle = entryMod.apply(ctx, {
    clock: () => 1000000,
    root,
    packs: [],
    vmu: {
      // ★ 轮 8：`metrics` 不是工具面（TOOL_FACES 里没有它）；`vmu.metrics.indicators` 是【设置族】，
      // 由 kernel/report.js 的 metricValues 读取。旧的 ['report','metrics'] 里 `report` 真生效、`metrics`
      // 一直是空转（未知名被静默丢弃）。去掉它后装配不再带一个不存在的面，断言（本套件只测 report 边界 +
      // metrics 服务，不测工具集）逐条不变。
      'vmu.tools.faces': ['report'],
      'vmu.metrics.indicators': ['artifacts'],
      'vmu.report.enabled': true,
      'vmu.report.minIntervalMs': 0,
      'vmu.report.reports': [
        { name: 'artifacts-met', trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 }, channel: 'log', template: 'ABOVE: artifacts={{ metric:artifacts }} gte 5' },
        { name: 'artifacts-unmet', trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 50 }, channel: 'log', template: 'BELOW: artifacts={{ metric:artifacts }} gte 50' },
        { name: 'turn-end-duty', trigger: { kind: 'event', event: 'turn-end' }, channel: 'log', template: 'CONTROL: fired on {{event}}' },
      ],
    },
    deliver: (report) => sink.push({ name: report.name, text: report.text }),
  })
  await handle.ready()
  const k = handle.kernel
  const boundary = (listeners['agent/turn-stopping'] || [])[0]
  const inSink = (n) => sink.filter((x) => x.name === n)

  // ── 0. the preconditions (each assertion below needs a non-empty one) ────────────────────────────────────
  ok(typeof boundary === 'function', 'P1. the entry really registered an `agent/turn-stopping` listener (the boundary is armed)', Object.keys(listeners))
  ok(k && typeof k.metricValues === 'function', 'P2. the kernel exposes `metricValues()` — the reading the boundary hands over', typeof (k && k.metricValues))
  ok(k && k.metrics && typeof k.metrics.observe === 'function', 'P3. the metrics face is live, so a policy can really count', typeof (k && k.metrics))

  // ── 1. THE REPRODUCTION: the OLD shape cannot fire a threshold (and is NOT widened into a fake fire) ─────
  const noMetrics = k.report.tick({ at: 1000000, event: 'turn-end' })
  const noMetricsNames = noMetrics.fired.map((f) => f.name)
  ok(noMetricsNames.includes('turn-end-duty'), 'R1. with NO metrics the event trigger still fires (the boundary itself works)', noMetricsNames)
  ok(!noMetricsNames.includes('artifacts-met'),
    'R2. ★ THE R18 DEFECT, REPRODUCED: the met threshold does NOT fire without metrics — `thresholdMet()` was NOT widened to "missing data counts as met"', noMetricsNames)

  // ── 2. NO OBSERVATION ⇒ NO KEY (never a fabricated zero) ─────────────────────────────────────────────────
  const emptyValues = k.metricValues()
  ok(Object.keys(emptyValues).length === 0, 'S1. a DECLARED but never-observed indicator is ABSENT from the boundary map (no fabricated 0)', emptyValues)
  const viaEmpty = k.report.tick({ at: 1000000, event: 'turn-end', metrics: emptyValues })
  ok(!viaEmpty.fired.some((f) => f.name === 'artifacts-met'), 'S2. so passing the empty map fires nothing (the red line holds end to end)', viaEmpty.fired.map((f) => f.name))

  // ── 3. REAL COUNTS ⇒ the boundary map carries them ───────────────────────────────────────────────────────
  for (let i = 0; i < 5; i += 1) k.metrics.observe({ name: 'artifacts', value: 1, by: 'tests', kind: 'change', source: 'suite' })
  const values = k.metricValues()
  ok(values.artifacts === 5, 'S3. `metricValues()` reads the REAL sum (5 observations of value 1 ⇒ 5)', values)

  // ── 4. ★ THE BOUNDARY FIRES BY ITSELF — the host event is emitted, nobody calls `report/tick` ─────────────
  await boundary()
  await new Promise((r) => setTimeout(r, 20))
  const names = sink.map((s) => s.name)
  ok(inSink('artifacts-met').length === 1, 'T1. the ABOVE-line threshold report FIRED AUTONOMOUSLY at the turn boundary and was delivered exactly once', names)
  ok(inSink('artifacts-unmet').length === 0, 'T2. ★ THE ADVERSARIAL HALF: the BELOW-line threshold report stayed SILENT in the SAME deployment', names)
  ok(/5/.test(String(inSink('artifacts-met')[0] && inSink('artifacts-met')[0].text)), 'T3. and the delivered text carries the REAL value, not a placeholder', inSink('artifacts-met')[0])
  ok(inSink('artifacts-unmet').length === 0, 'T4. across the WHOLE run the unmet report fired ZERO times (its silence is measured, not assumed)', names)
})()

// Windows keeps the store handle open, so cleanup is BEST EFFORT: a locked temp dir must not turn a green suite red.
try { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* the temp dir stays */ }

console.log('=== VMU R19 BOUNDARY METRICS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
