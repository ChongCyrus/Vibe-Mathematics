#!/usr/bin/env node
// vmu METRIC COUNTER GUARD — `packs/v5r/middleware/artifact-counter.js` (Round 20, task-126).
// Run: `node tests/vmu-metrics-counter.test.mjs` (last line `=== VMU METRIC COUNTER: N passed, M failed ===`).
//
// WHY THIS SUITE EXISTS. The counter is the ONE condition that closes "may a `threshold` report fire on its own?":
// R19 proved the boundary delivers threshold reports when `metricValues()` is non-empty; R20's real DSH session
// measured that in the SHIPPED deployment it was `{}` — because no producer existed. A producer that is not under
// guard is exactly the "works today, gone tomorrow" class, so the three states are asserted here:
//   ① INSTALLED   ⇒ after real intra-turn events the count EXISTS and has the right value (read back through
//                   `kernel.metricValues()`, not through the handler's own return value);
//   ② NOT INSTALLED ⇒ zero observations and `metricValues()` is `{}` (no fabricated 0 — the boundary stays silent);
//   ③ INDICATOR NOT DECLARED ⇒ a NAMED skip that is COUNTED (never a silent no-op, never a thrown error that would
//                   break the tool call it is watching).
// Plus the SHAPE rules that make it usable at all: intra-turn hooks only (the report boundary listens on
// `agent/turn-stopping`; an observation written at the reader's own instant may be visible only NEXT turn), and the
// loader's capability/meta requirements (module-level capabilities, `trigger-workflow` for the service seam).
//
// RULE E: every collection assertion states NON-EMPTINESS in the same expression and prints the count.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as entryMod from '../vibe-math-vmu/vibe-math-vmu.js'
import { createMetrics } from '../vibe-math-vmu/kernel/metrics.js'
import { COUNTER_POLICY, COUNTER_HOOKS, COUNTER_BY, V5R_ARTIFACT_COUNTER, indicatorFor } from '../vibe-math-vmu/packs/v5r/middleware/artifact-counter.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}

/** A DSH ctx stand-in that RECORDS registrations, so "is this hook really bridged?" is measurable. */
const fakeCtx = (listeners) => ({
  effect: (fn) => fn(),
  on: (name, l) => { (listeners[name] = listeners[name] || []).push(l); return () => {} },
  tools: { register: async () => () => {} },
})

console.log('=== 1. THE DECLARED SHAPE (what the loader will insist on) ===')
ok(V5R_ARTIFACT_COUNTER.meta && V5R_ARTIFACT_COUNTER.meta.id === COUNTER_BY && Number.isInteger(V5R_ARTIFACT_COUNTER.meta.apiVersion),
  'S1. the module declares meta { id, apiVersion } with the id its entry uses', V5R_ARTIFACT_COUNTER.meta)
ok(Array.isArray(V5R_ARTIFACT_COUNTER.capabilities) && V5R_ARTIFACT_COUNTER.capabilities.includes('trigger-workflow'),
  'S2. and the capability that unlocks `api.services.get` (module-level, not only on the entry)', V5R_ARTIFACT_COUNTER.capabilities)
const hooks = Object.keys(V5R_ARTIFACT_COUNTER.hooks || {})
ok(hooks.length > 0 && hooks.every((h) => typeof V5R_ARTIFACT_COUNTER.hooks[h] === 'function'),
  'S3. every declared hook is a function (a JSON manifest cannot carry these — the reason this must ship in the pack)', hooks)
ok(hooks.length === COUNTER_HOOKS.length && COUNTER_HOOKS.every((h) => hooks.includes(h)),
  'S4. the hook set is exactly the policy table\'s (the two cannot drift)', { hooks, policy: COUNTER_HOOKS })
ok(!hooks.includes('agent/turn-stopping'),
  'S5. ★ it does NOT observe at the report boundary\'s own instant (`agent/turn-stopping`): the boundary listens there too, and a same-instant write may only be visible NEXT turn — a one-turn session would then read as "never fired"', hooks)
ok(COUNTER_POLICY.length > 0 && COUNTER_POLICY.every((r) => r.indicator && Array.isArray(r.on) && r.on.length > 0),
  'S6. the policy is a non-empty table of {indicator, on[]} rows (policy as data, count printed)', COUNTER_POLICY.map((r) => r.indicator))
ok(indicatorFor('tools/result') === 'tool-results' && indicatorFor('math/job-settled') === 'settled-jobs' && indicatorFor('nope/nope') === null,
  'S7. hook → indicator resolution is total over the table and null outside it')

console.log('=== 2. ① INSTALLED: real intra-turn events produce REAL observations ===')
const rootA = await mkdtemp(join(tmpdir(), 'vmu-counter-a-'))
const listenersA = {}
const before2 = V5R_ARTIFACT_COUNTER.counters()
const handleA = entryMod.apply(fakeCtx(listenersA), {
  clock: () => 1000000,
  root: rootA,
  packs: ['v5r'],
  'vmu.packs.active': ['v5r'],
  'vmu.metrics.indicators': ['tool-results', 'settled-jobs'],
})
await handleA.ready()
{
  const k = handleA.kernel
  const entries = (k.bus.status().entries || []).filter((e) => String(e.id).startsWith('v5r.artifact-counter'))
  ok(entries.length > 0 && entries.every((e) => Array.isArray(e.on) && e.on.length > 0),
    'I1. the pack entry really became bus entries through the loader (which attaches `api`; count printed)', entries.map((e) => e.id))
  ok(Array.isArray(entries[0].capabilities) && entries[0].capabilities.includes('trigger-workflow'),
    'I2. and they carry trigger-workflow, so the service seam is unlocked', entries[0] && entries[0].capabilities)
  const bridged = listenersA['tools/result'] || []
  ok(bridged.length > 0,
    'I3. ★ the host hook `tools/result` is BRIDGED (the host bundle\'s own rule: "observe final tool outcomes on tools/result")', Object.keys(listenersA))
  ok((listenersA['math/job-settled'] || []).length === 0,
    'I4. a VMU-internal hook needs no host bridge (it is emitted on the bus directly) — asserted so the two paths stay distinguishable')

  // DRIVE: three real tool results inside the turn (the host calls the listener; nobody calls report/tick)
  for (let i = 0; i < 3; i += 1) for (const l of bridged) await l({}, { ok: true })
  await new Promise((r) => setTimeout(r, 10))
  const values = k.metricValues()
  ok(values['tool-results'] === 3,
    'I5. ★★ three completed tool calls read back as `tool-results === 3` through kernel.metricValues() (the boundary\'s own reader)', values)
  // a second, vmu-internal event path
  k.bus.emit('math/job-settled', { jobId: 'j-1', engine: 'probe' })
  k.bus.emit('math/job-settled', { jobId: 'j-2', engine: 'probe' })
  await new Promise((r) => setTimeout(r, 10))
  const values2 = k.metricValues()
  ok(values2['settled-jobs'] === 2,
    'I6. and the two intra-turn `math/job-settled` events read back as `settled-jobs === 2`', values2)
  const after2 = V5R_ARTIFACT_COUNTER.counters()
  ok(after2.observed - before2.observed === 5 && after2.skippedUndeclared === before2.skippedUndeclared,
    'I7. the module\'s own counters agree with the face (recorded 5, no skips) — receipt and fact stated separately',
    { observed: after2.observed - before2.observed, skipped: after2.skippedUndeclared - before2.skippedUndeclared })
}
await rm(rootA, { recursive: true, force: true })

console.log('=== 3. ② NOT INSTALLED: zero observations, and NO fabricated 0 ===')
const rootB = await mkdtemp(join(tmpdir(), 'vmu-counter-b-'))
const listenersB = {}
const before3 = V5R_ARTIFACT_COUNTER.counters()
const handleB = entryMod.apply(fakeCtx(listenersB), {
  clock: () => 1000000,
  root: rootB,
  // the SAME deployment knobs (indicators declared), but NO pack ⇒ no producer
  'vmu.metrics.indicators': ['tool-results', 'settled-jobs'],
})
await handleB.ready()
{
  const k = handleB.kernel
  const entries = (k.bus.status().entries || []).filter((e) => String(e.id).startsWith('v5r.artifact-counter'))
  ok(entries.length === 0, 'N1. with no pack the counter is not on the bus at all (count printed)', entries.length)
  ok((listenersB['tools/result'] || []).length === 0, 'N2. and nothing is bridged, so no host event can reach a counter', Object.keys(listenersB))
  for (const l of (listenersB['tools/result'] || [])) await l({}, { ok: true })
  await new Promise((r) => setTimeout(r, 10))
  const values = k.metricValues()
  ok(values && Object.keys(values).length === 0 && values['tool-results'] === undefined,
    'N3. ★★ `metricValues()` is EMPTY — no key, no fabricated 0 ⇒ the boundary keeps its honest "nothing to read" answer', values)
  ok(V5R_ARTIFACT_COUNTER.counters().observed === before3.observed,
    'N4. and the module recorded nothing (its counter did not move)', V5R_ARTIFACT_COUNTER.counters())
}
await rm(rootB, { recursive: true, force: true })

console.log('=== 4. ③ INDICATOR NOT DECLARED: a NAMED skip, COUNTED (never silent) ===')
const rootC = await mkdtemp(join(tmpdir(), 'vmu-counter-c-'))
const listenersC = {}
const before4 = V5R_ARTIFACT_COUNTER.counters()
const handleC = entryMod.apply(fakeCtx(listenersC), {
  clock: () => 1000000,
  root: rootC,
  packs: ['v5r'],
  'vmu.packs.active': ['v5r'],
  // `settled-jobs` is deliberately NOT declared here; `tool-results` is
  'vmu.metrics.indicators': ['tool-results'],
})
await handleC.ready()
{
  const k = handleC.kernel
  const bridged = listenersC['tools/result'] || []
  for (const l of bridged) await l({}, { ok: true })
  await new Promise((r) => setTimeout(r, 10))
  ok(k.metricValues()['tool-results'] === 1,
    'U1. the DECLARED indicator still records (the deployment keeps what it asked for)', k.metricValues())
  // the undeclared one: emit the vmu-internal event the policy watches
  k.bus.emit('math/job-settled', { jobId: 'j-x' })
  await new Promise((r) => setTimeout(r, 10))
  const after = V5R_ARTIFACT_COUNTER.counters()
  ok(after.skippedUndeclared - before4.skippedUndeclared === 1,
    'U2. ★ the undeclared indicator produced exactly ONE named skip, and the module COUNTED it (readable, not silent)',
    { delta: after.skippedUndeclared - before4.skippedUndeclared, last: after.last })
  ok(k.metricValues()['settled-jobs'] === undefined,
    'U3. and nothing was recorded for it — no fabricated value (the skip is not a quiet success)', k.metricValues())
  ok(after.last && typeof after.last.code === 'string' && after.last.code.length > 0,
    'U4. the skip carries a NAMED code (the metrics face\'s own refusal code, reused — this module invents none)', after.last)

  // the handler's own answer for the same call, driven directly (the refusal is converted, never rethrown)
  const direct = await V5R_ARTIFACT_COUNTER.hooks['math/job-settled']({
    hook: 'math/job-settled',
    api: { services: { get: () => k.metrics } },
  })
  ok(direct && direct.ok === false && typeof direct.code === 'string' && direct.counted === false && direct.counters && direct.counters.skippedUndeclared >= 2,
    'U5. driven directly, the handler returns `{ok:false, counted:false, code}` + the running counters instead of throwing', direct && { ok: direct.ok, code: direct.code, counted: direct.counted })
  // and the ZERO-MECHANISM half: nothing declared at all ⇒ the face's own skip, passed through with ITS reason
  const tp = V5R_ARTIFACT_COUNTER.hooks['tools/result']
  ok(typeof tp === 'function',
    'U0. the intra-turn hook `tools/result` still exists on the module (a policy moved onto the boundary would be caught here, not crashed into)',
    Object.keys(V5R_ARTIFACT_COUNTER.hooks))
  const bare = createMetrics({ clock: () => 1000000, settings: {} })
  const none = typeof tp === 'function' ? await tp({
    hook: 'tools/result',
    api: { services: { get: () => bare } },
  }) : { ok: false, counted: false, reason: 'hook tools/result is missing from the module' }
  ok(none && none.ok === true && none.counted === false && /no indicators declared/.test(String(none.reason)),
    'U6. with NO indicators declared the face\'s own zero-mechanism skip is passed through by name (ok:true, counted:false, its reason)', none && { ok: none.ok, counted: none.counted, reason: none.reason })
  // and with no api at all (an inline bus entry): a NAMED refusal, not a crash
  const noSeam = typeof tp === 'function' ? await tp({ hook: 'tools/result' }) : { ok: false, code: 'hook-missing' }
  ok(noSeam && noSeam.ok === false && noSeam.code === 'VMU_ENGINE_UNAVAILABLE',
    'U7. a handler reached without the loader\'s `api` refuses BY NAME (why this must be a module entry)', noSeam && noSeam.code)
}
await rm(rootC, { recursive: true, force: true })

console.log('')
console.log('=== VMU METRIC COUNTER: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
