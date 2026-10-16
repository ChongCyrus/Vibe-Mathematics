#!/usr/bin/env node
// ★ FEEDBACK GATE (phase-2 round 16) — THE ASSERTION THAT WAS MISSING when 329 suites were green while delivery
// never happened (commit ca531db fixed the code; this pins it).
//
// ★ WHAT IT PINS, AND WHAT IT DOES NOT: it pins that the chain CONFIG → RECEIPT → DELIVERY IS CONNECTED.
// It does NOT claim the delivered CONTENT is correct — that is the module's own assertions' job.
//
// ★ REAL ENTRY (never a hand-built kernel): `entry.apply(ctx, …)` through a `fakeCtx` in the shape of
// tests/vmu-entry.test.mjs, with a `systemPrompt.context` that COUNTS. The regression lived in the ASSEMBLY layer,
// so a hand-built kernel would have walked around it.
// ★ NON-EMPTY PRECONDITION: the delivery must really be reached (context() called ≥ 1) — otherwise the assertion
// could "pass" on a path where nothing was ever delivered.
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const clock = () => '2026-10-09T00:00:00.000Z'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 180) + ']')) }

/** fakeCtx in the vmu-entry shape, plus a COUNTING systemPrompt.context. */
const fakeCtx = (extra = {}) => {
  const state = { specs: [], effects: [], sections: [], listeners: {}, contextCalls: [] }
  const base = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on(event, handler) { (state.listeners[event] = state.listeners[event] || []).push(handler); return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const ctx = Object.assign(base, {
    systemPrompt: {
      context: (payload) => { state.contextCalls.push(payload); return { ok: true, bytes: 0 } },
      section: () => () => {},
      getSectionOrder: () => 5,
    },
  }, extra)
  return { ctx, state }
}
/** Find the 9-key feedback receipt by SHAPE, wherever the face exposes it (status()/report()…). */
const findFeedback = (root) => {
  const seen = new Set()
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 4 || seen.has(v)) return null
    seen.add(v)
    if (typeof v.enabled === 'boolean' && typeof v.delivered === 'boolean' && 'code' in v && 'stack' in v) return v
    for (const k of Object.keys(v)) { const r = walk(v[k], depth + 1); if (r) return r }
    return null
  }
  return walk(root, 0)
}
const receiptOf = (handle) => {
  for (const m of ['status', 'report', 'snapshot']) {
    if (handle && handle.kernel && typeof handle.kernel[m] === 'function') {
      let r = null
      try { r = handle.kernel[m]() } catch (e) { continue }
      const f = findFeedback(r)
      if (f) return f
    }
  }
  return null
}

// ── ARM 1: config ON ⇒ receipt enabled ⇒ delivered AND context() called exactly once ────────────────────────────
{
  const { ctx, state } = fakeCtx()
  const handle = entry.apply(ctx, { clock, vmu: { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' } })
  const fb = receiptOf(handle)
  ok(fb !== null, '★ the face exposes the feedback receipt through the assembled handle (found by shape)', fb && JSON.stringify(fb).slice(0, 80))
  ok(fb && fb.enabled === true, '★ config ON ⇒ the receipt says enabled:true (the switch is readable at all)', fb && String(fb.enabled))
  // NON-EMPTY PRECONDITION: delivery was really reached
  ok(state.contextCalls.length >= 1, '★★ PRECONDITION: the delivery call (`systemPrompt.context`) really ran (count ≥ 1)', state.contextCalls.length)
  ok(fb && fb.delivered === true, '★★ CONFIG → RECEIPT → DELIVERY: enabled:true ⇒ delivered:true', fb && String(fb.delivered))
  ok(state.contextCalls.length === 1, '★★ and `context()` was called EXACTLY ONCE (not zero, not twice)', state.contextCalls.length)
  // (no tool-surface assertion here: the report TOOL comes from the pack, which this config does not load — asserting
  //  it would test the pack's presence, not this chain. The chain itself is proven by the four assertions above.)
}
// ── ARM 2 (reverse): config OFF ⇒ nothing: enabled:false, delivered:false, context() 0 calls (zero mechanism) ───
{
  const { ctx, state } = fakeCtx()
  const handle = entry.apply(ctx, { clock, vmu: { 'vmu.report.feedback': false, 'vmu.report.audience': 'm1' } })
  const fb = receiptOf(handle)
  ok(fb !== null && fb.enabled === false, '★ reverse arm: config OFF ⇒ enabled:false', fb && String(fb.enabled))
  ok(fb !== null && fb.delivered === false, '★ reverse arm: delivered:false', fb && String(fb.delivered))
  ok(state.contextCalls.length === 0, '★ reverse arm: `context()` was NEVER called (0) — turning it off really turns it off', state.contextCalls.length)
}

console.log('')
console.log('=== B1PRIME FEEDBACK GATE: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
