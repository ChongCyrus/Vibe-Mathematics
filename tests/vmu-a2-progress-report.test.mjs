// tests/vmu-a2-progress-report.test.mjs — AUDIT A2: 「有进展时自动唤起所办汇报」.
//
// WHAT WAS MISSING (measured in the closing audit, `rules-ledger.json` row A2): the reporting face
// (`kernel/report.js`) has always understood `trigger.kind === 'event'` with `event: 'progress'`, and the v5r rules
// say a progress row is what makes the office's own reporting fire. Nothing in the tree emitted that event — the
// only automatic trigger was `turn-end`, wired in `vibe-math-vmu.js`. A rule about "when progress happens the
// office is called" therefore had no mechanism at all: a deployment could declare the report and it would never
// fire on its own.
//
// WHAT THIS SUITE PROVES, in two layers:
//   · LAYER 1 (the module): `kernel/records.js` calls an INJECTED `onProgress` hook exactly once per COMMITTED
//     `progress` row, never for another track, and never when the write was refused;
//   · LAYER 2 (the kernel): the kernel wires that hook to `report.tick({ event: 'progress' })`, so a declared
//     report actually fires when a progress row lands — and a kernel whose reporting is undeclared (the default)
//     rings nothing, because "no declaration" must stay silent.
//
// Run: node tests/vmu-a2-progress-report.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href

let passed = 0
const failures = []
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ok   ' + msg) } else { failures.push(msg); console.log('  FAIL ' + msg) } }

const boot = async ({ root, vmu = {} } = {}) => {
  const entry = await import(ENTRY)
  const ctx = { effect: (fn) => fn(), on: () => () => {}, get: () => undefined, tools: { register: async () => () => {} } }
  let t = 1_000
  const handle = entry.apply(ctx, { clock: () => (t += 1_000), packs: ['v5r'], root, vmu })
  await handle.ready()
  return { kernel: handle.kernel, ticks: () => t }
}

// ─── LAYER 1: the module-level hook ─────────────────────────────────────────────────────────────────────────
console.log('=== 1. THE HOOK IS CALLED ON A COMMITTED progress ROW, AND ONLY THERE ===')
{
  const calls = []
  const rec = createRecords({ clock: () => 42, onProgress: (row) => calls.push(row) })
  const put = rec.put({ track: 'progress', kind: 'progress', title: 'first', body: 'x', settled: true })
  ok(put.ok === true && typeof put.id === 'string', 'the progress row was committed - ' + JSON.stringify(put.id))
  ok(calls.length === 1, 'the hook ran exactly once - ' + calls.length)
  ok(calls[0] && calls[0].id === put.id && calls[0].track === 'progress', 'the hook got the committed row - ' + JSON.stringify(calls[0]))
  // a different track is not progress: the bell must not ring
  const state = rec.put({ track: 'state', kind: 'state', title: 'panel', body: 'y', settled: true })
  ok(state.ok === true && calls.length === 1, 'a state row did not ring the bell - ' + calls.length)
  // a REFUSED write never rings: the row does not exist, so there is nothing to report
  let refused = null
  try { rec.put({ track: 'progress', kind: 'not-a-kind', title: 'bad', settled: true }) } catch (e) { refused = e && e.code }
  ok(refused === 'VMU_INVALID_ARGUMENT', 'the bad write was refused by name - ' + String(refused))
  ok(calls.length === 1, 'a refused write did not ring the bell - ' + calls.length)
  // the hook is OPTIONAL: without it nothing happens and nothing is required of the caller
  const plain = createRecords({ clock: () => 43 })
  ok(plain.put({ track: 'progress', kind: 'progress', title: 'no hook', settled: true }).ok === true, 'a records face without the hook still writes progress')
  // a THROWING hook must not fail the write that rang it
  const fragile = createRecords({ clock: () => 44, onProgress: () => { throw new Error('bell exploded') } })
  const survived = fragile.put({ track: 'progress', kind: 'progress', title: 'fragile', settled: true })
  ok(survived.ok === true, 'a throwing hook does not undo a committed row')
}

// ─── LAYER 2: the kernel wiring ────────────────────────────────────────────────────────────────────────────
console.log('=== 2. THE KERNEL RINGS report.tick({ event: "progress" }) — DECLARED REPORTS FIRE ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2-'))
  try {
    const { kernel } = await boot({
      root,
      vmu: {
        report: {
          enabled: true,
          reports: [{ name: 'progress-bell', trigger: { kind: 'event', event: 'progress' }, template: 'progress {{ event }} at {{ at }}', to: ['office'], channel: 'inbox' }],
        },
      },
    })
    ok(kernel && kernel.report && typeof kernel.report.tick === 'function', 'the kernel exposes a reporting face')
    const seen = []
    const orig = kernel.report.tick.bind(kernel.report)
    kernel.report.tick = (a) => { seen.push(a); return orig(a) }
    const put = kernel.records.put({ track: 'progress', kind: 'progress', title: 'round 125 progress', body: 'did things', settled: true })
    ok(put.ok === true, 'the kernel wrote a progress row - ' + JSON.stringify(put.id))
    ok(seen.length === 1, 'the kernel ticked the reporting face once - ' + seen.length)
    ok(seen[0] && seen[0].event === 'progress', 'the tick carries event:"progress" - ' + JSON.stringify(seen[0] && seen[0].event))
    const receipt = seen[0] && seen[0].__receipt
    kernel.records.put({ track: 'state', kind: 'state', title: 'panel only', body: 'p', settled: true })
    ok(seen.length === 1, 'a state row did not tick the reporting face - ' + seen.length)
    void receipt
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('=== 3. A DEPLOYMENT THAT DECLARES NO progress LISTENER STAYS SILENT ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2b-'))
  try {
    // ★ The v5r pack DOES declare a `progress` listener now (§4), so "silence" is proven by a deployment that declares
    // the face and OTHER reports but no progress one: the seam fires, the vocabulary accepts the event, and nothing runs.
    const { kernel } = await boot({
      root,
      vmu: { report: { enabled: true, reports: [{ name: 'only-meetings', trigger: { kind: 'event', event: 'meeting-closed' }, template: 'm {{ at }}', to: ['office'], channel: 'inbox' }] } },
    })
    const seen = []
    const orig = kernel.report.tick.bind(kernel.report)
    let last = null
    kernel.report.tick = (a) => { seen.push(a); last = orig(a); return last }
    kernel.records.put({ track: 'progress', kind: 'progress', title: 'nobody declared a report', body: 'q', settled: true })
    ok(seen.length === 1, 'the hook still runs (the seam exists without a policy) - ' + seen.length)
    // The v5r pack may turn the FACE on (vmu.report.enabled) so the office can use it; what must stay silent is the
    // REPORT LIST — the assert is about declarations, not about a switch a policy legitimately flipped.
    ok(last && Array.isArray(last.fired) && last.fired.length === 0, 'nothing fired: no report declares event "progress" - ' + JSON.stringify(last && { fired: last.fired && last.fired.length, declared: last.declared }))
    // `declared` in this receipt is the report FACE's declaration reading (a shape, not a list) — the behavioural
    // claim is the one that matters: a progress row fires no report when nothing listens for that event.
    ok(last && !(Array.isArray(last.fired) && last.fired.length > 0), 'no report fired on the progress event')
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('=== 4. THIS INSTITUTION DECLARES THE LISTENER (r126 MEASURED NONE) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2c-'))
  try {
    const { kernel } = await boot({ root })
    const decl = kernel.report.declarations()
    const items = decl && Array.isArray(decl.items) ? decl.items : []
    const listeners = items.filter((it) => it && it.kind === 'event' && it.event === 'progress')
    ok(listeners.length >= 1, 'v5r declares at least one event report on "progress" - ' + JSON.stringify(items.map((it) => it && it.name)))
    ok(listeners.length >= 1 && Array.isArray(listeners[0].to) && listeners[0].to.includes('office'), 'the progress notice goes to the OFFICE pseudo-id - ' + JSON.stringify(listeners[0] && listeners[0].to))
    ok(listeners.length >= 1 && listeners[0].channel === 'inbox', 'it is delivered as an inbox notice (a notification, not a task) - ' + JSON.stringify(listeners[0] && listeners[0].channel))
    const seen = []
    const orig = kernel.report.tick.bind(kernel.report)
    kernel.report.tick = (a) => { const r = orig(a); seen.push(r); return r }
    kernel.records.put({ track: 'progress', kind: 'progress', title: 'r126 progress', body: 'the office should hear this', settled: true })
    const last = seen[seen.length - 1]
    ok(last && Array.isArray(last.fired) && last.fired.length >= 1, 'a progress row FIRES the declared listener - ' + JSON.stringify(last && { fired: last.fired, skipped: last.skipped }))
    ok(last && JSON.stringify(last.fired || []).includes('v5r-progress-notice'), 'the fired report is named in the receipt - ' + JSON.stringify(last && last.fired))
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f); process.exit(1) }
console.log('vmu-a2-progress-report: ' + passed + ' passed, 0 failed')
