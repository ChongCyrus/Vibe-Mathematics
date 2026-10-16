#!/usr/bin/env node
// ★ STATE-SPLIT PINS (phase-2 round 19, from the reviewer's R18 finding — commit 9dc746e).
//
// ★ WHAT THESE PIN — AND WHAT THEY DO NOT: they pin that these HOST STATES ARE DISTINGUISHABLE IN THE RECEIPT.
// They do NOT claim the states are mutually exclusive in the host, and they deliberately do NOT pin any `reason`
// TEXT (that is what drifted): the pins are STRUCTURAL (which `what` / stack presence), so a wording change cannot
// redden them — while a state COLLISION does.
//
// ★ WHY DISTINCTNESS IS A RED LINE (not cosmetics): before the split, "no service provided" and "a service was
// provided but carries no `.context()`" produced the SAME sentence. If those two read alike, the SAME host state
// would sometimes be reported as "NOT reachable" and sometimes as "the host has no `.context` method" — a NAMED BUT
// UNTRUE receipt about the host. "Do not state a missing capability as a falsehood about the host."
//
// ★ REAL ENTRY: `entry.apply(ctx, …)` with a `fakeCtx` in the vmu-entry shape; only `ctx.get`/`systemPrompt` vary.
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const clock = () => '2026-10-09T00:00:00.000Z'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 170) + ']')) }

const fakeCtx = (getImpl) => {
  const state = { contextCalls: [], specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get: getImpl,
  }
  return { ctx, state }
}
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
const receiptFor = (getImpl) => {
  const { ctx, state } = fakeCtx(getImpl)
  const handle = entry.apply(ctx, { clock, vmu: { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' } })
  let fb = null
  for (const m of ['status', 'report', 'snapshot']) {
    if (handle && handle.kernel && typeof handle.kernel[m] === 'function') {
      try { fb = findFeedback(handle.kernel[m]()) } catch (e) { fb = null }
      if (fb) break
    }
  }
  return { fb, state }
}
const short = (fb) => fb && { what: fb.what, reason: String(fb.reason).slice(0, 60), stack: fb.stack === null ? null : 'present', delivered: fb.delivered }

// ── STATE 1: `ctx.get` returns undefined ⇒ NO service (only ONE place can honestly claim the host lacks `.context`) ──
const noService = receiptFor(() => undefined)
ok(noService.fb !== null && noService.fb.delivered === false, '★ state 1 precondition: `ctx.get` ⇒ undefined produced a NOT-delivered receipt', short(noService.fb))
// ── STATE 2: a service IS provided but carries no `.context()` ───────────────────────────────────────────────────
const noContext = receiptFor(() => ({ section: () => () => {} }))
ok(noContext.fb !== null && noContext.fb.delivered === false, '★ state 2 precondition: a service WITHOUT `.context` produced a NOT-delivered receipt', short(noContext.fb))
// ★★ THE PIN: the two states must NOT read alike
ok(noService.fb && noContext.fb && noService.fb.what !== noContext.fb.what,
  '★★ PIN 1a: "no service" and "service without .context" report DIFFERENT `what` (else the receipt is a false claim about the host)',
  'noService.what=' + (noService.fb && noService.fb.what) + ' noContext.what=' + (noContext.fb && noContext.fb.what))
ok(noService.fb && noContext.fb && noService.fb.reason !== noContext.fb.reason,
  '★★ PIN 1b: and their `reason` also differs (the two host states are distinguishable to a reader)',
  'noService.reason=' + (noService.fb && String(noService.fb.reason).slice(0, 40)) + ' | noContext.reason=' + (noContext.fb && String(noContext.fb.reason).slice(0, 40)))
// ── STATE 3: the READ ITSELF throws  vs  ── STATE 4: the CALL is refused ─────────────────────────────────────────
const readThrew = receiptFor(() => { throw new Error('get() exploded') })
const callRefused = receiptFor(() => ({ context: () => { throw new Error('host refused the feedback context') } }))
ok(readThrew.fb !== null && callRefused.fb !== null, '★ states 3/4 preconditions: both produced receipts', short(readThrew.fb) + ' / ' + short(callRefused.fb))
ok(readThrew.fb && callRefused.fb && readThrew.fb.reason !== callRefused.fb.reason,
  '★★ PIN 2a: "the read threw" and "the call was refused" carry DIFFERENT `reason`',
  String(readThrew.fb && readThrew.fb.reason).slice(0, 50) + ' vs ' + String(callRefused.fb && callRefused.fb.reason).slice(0, 50))
ok(readThrew.fb && callRefused.fb && readThrew.fb.stack !== null && callRefused.fb.stack !== null,
  '★★ PIN 2b: and BOTH carry a stack (each failure is traceable, not just named)',
  'readThrew.stack=' + (readThrew.fb && readThrew.fb.stack !== null) + ' callRefused.stack=' + (callRefused.fb && callRefused.fb.stack !== null))
// ★ and no state may claim delivery while nothing was delivered
ok([noService, noContext, readThrew, callRefused].every((r) => r.fb && r.fb.delivered === false),
  '★ none of the four failing host states claims `delivered:true` (the receipt does not over-claim)')

console.log('')
console.log('=== B1PRIME STATE SPLIT: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
