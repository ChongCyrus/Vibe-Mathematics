#!/usr/bin/env node
// ★ SHAPE PIN (phase-2 round 14): the NINE report-feedback keys are constructed in TWO places —
//   (1) `kernel/reportfeedback.js` `reportFeedbackReceipt()` — the REAL source, injected through `kernel/index.js`;
//   (2) the INLINE FALLBACK inside `kernel/report.js`'s `feedbackReceipt()` — because that file has a "zero import"
//       invariant and cannot import (1).
// The two were measured identical (9/9, same config) but NOTHING pinned them ⇒ "consistent today, silently
// divergent tomorrow". This test pins them with REAL construction on both sides.
//
// ★ WHAT THIS ASSERTS — AND WHAT IT DOES NOT: it pins that the TWO PATHS AGREE. It does NOT claim either is correct;
// correctness of each shape is covered by their own assertions (reportfeedback's own tests and report.js's own).
// ★ NON-EMPTY PRECONDITION on both sides: path (1) is proven by the spy provider actually being invoked (its `c` is
// captured), path (2) by building the face with NO provider at all — and the counterexample run proves a `throw`
// inserted into the fallback is really reached (i.e. that building without a provider does exercise it).
import { createReport } from '../vibe-math-vmu/kernel/report.js'
import { reportFeedbackReceipt } from '../vibe-math-vmu/kernel/reportfeedback.js'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 180) + ']')) }
const KEYS = ['enabled', 'source', 'audience', 'delivered', 'registered', 'code', 'what', 'reason', 'stack']

/** Pull the 9-key object out of whatever surface this face exposes (status()/report()/… — the receipt carries it). */
const feedbackOf = (face) => {
  for (const m of ['status', 'report', 'snapshot']) {
    if (typeof face[m] !== 'function') continue
    let r = null
    try { r = face[m]() } catch (e) { continue }
    if (r && typeof r === 'object' && r.reportFeedback && typeof r.reportFeedback === 'object') return r.reportFeedback
  }
  return null
}
const diffKeys = (a, b) => KEYS.filter((k) => !Object.is(a[k], b[k]))

// ── path (1): assembled WITH a provider ⇒ the real source runs; the spy captures the exact input `c` ────────────
let captured = null
const spy = (c) => { captured = c; return reportFeedbackReceipt(c) }
const assembled = createReport({ clock: () => 1000, settings: {}, feedback: spy })
const shapeFromProvider = feedbackOf(assembled)
ok(captured !== null, '★ NON-EMPTY: the injected provider really ran (its input `c` was captured)', String(captured))
ok(shapeFromProvider !== null && KEYS.every((k) => k in shapeFromProvider),
  '★ path (1): the assembled face produced the 9 keys through the REAL source', shapeFromProvider && Object.keys(shapeFromProvider).join(','))

// ── path (2): NO provider ⇒ the INLINE FALLBACK in report.js ─────────────────────────────────────────────────────
const bare = createReport({ clock: () => 1000, settings: {} })
const shapeFromFallback = feedbackOf(bare)
ok(shapeFromFallback !== null && KEYS.every((k) => k in shapeFromFallback),
  '★ path (2): a face built with NO provider still returns the 9 keys (the inline fallback ran)',
  shapeFromFallback && Object.keys(shapeFromFallback).join(','))

// ── THE PIN: BOTH paths get the SAME EXPLICIT input, then must agree FIELD BY FIELD ──────────────────────────────
// ★ MY FIRST VERSION COMPARED DIFFERENT INPUTS (the spy's internal `c` on one side, the fallback's own hardcoded
// literals on the other) and reported `differing: [code, what, reason]` — the reviewer's own trap: comparing two
// things fed differently yields ZERO information. The comparison must therefore fix the input on BOTH sides.
if (captured && shapeFromFallback) {
  // ★ `source` IS THE FIELD THAT CARRIES A LAYER, AND ONLY A CALLER CAN NAME ONE. The layer that armed the switch is
  // known to whoever read it (the entry passes the kernel's resolved provenance), so the inline fallback - which has no
  // caller - must not invent one for an ARMED switch. With the switch OFF, though, the default layer really is what is
  // in force, so both sides legitimately say `default`; that is the shared input here, and the assertion after the pin
  // pins the asymmetry that opens up once a layer is actually named.
  const SHARED = Object.freeze({
    enabled: false, source: 'default', audience: null, delivered: false, registered: false,
    code: 'VMU_EXTERNAL_UNAVAILABLE', what: 'systemPrompt.context',
    reason: shapeFromFallback.reason, stack: null,
  })
  const real = reportFeedbackReceipt(SHARED)
  ok(JSON.stringify(Object.keys(real)) === JSON.stringify(Object.keys(shapeFromFallback)),
    '★ the two paths emit the SAME KEY SET IN THE SAME ORDER (agreement pin, not a correctness claim)',
    Object.keys(real).join(',') + ' vs ' + Object.keys(shapeFromFallback).join(','))
  const d = diffKeys(real, shapeFromFallback)
  ok(d.length === 0,
    '★★ SHAPE PIN: with the SAME input, the real source and the inline fallback agree on ALL 9 FIELDS',
    'differing: [' + d.join(',') + '] real=' + JSON.stringify(real) + ' fallback=' + JSON.stringify(shapeFromFallback))
  // ★ THE ASYMMETRY, PINNED SO IT CANNOT DRIFT EITHER WAY: handed a layer, the real source carries it through, while the
  // fallback keeps stating only the layer it can know. The old code hardcoded the settings key here for ANY armed switch,
  // which became false the moment a pack default or a deployment config supplied the value - this reds if that returns.
  const attributed = reportFeedbackReceipt(Object.assign({}, SHARED, { source: 'pack:v5r' }))
  ok(attributed.source === 'pack:v5r' && shapeFromFallback.source === 'default',
    '★★ the real source carries the layer it is GIVEN, while the fallback states only the layer it can know',
    'given=pack:v5r real=' + JSON.stringify(attributed.source) + ' fallback=' + JSON.stringify(shapeFromFallback.source))
  // and the fallback's hardcoded literals must be exactly what the real source echoes back for that input
  ok(shapeFromFallback.code === 'VMU_EXTERNAL_UNAVAILABLE' && shapeFromFallback.what === 'systemPrompt.context',
    '★ the fallback’s named-degradation literals match the house form the real source carries',
    shapeFromFallback.code + ' / ' + shapeFromFallback.what)
} else {
  failures.push('★ the pin could not run: one of the two paths produced nothing (see the assertions above)')
}

console.log('')
console.log('=== B1PRIME REPORTFEEDBACK SHAPE PIN: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
