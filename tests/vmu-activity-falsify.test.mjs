// tests/vmu-activity-falsify.test.mjs — FAMILY 8: `kernel/activity.js`, the FUTURE-ONLY one-shot waiter.
// Run: node tests/vmu-activity-falsify.test.mjs
//
// ROUND 8: this file used to carry its own hand-rolled mutation plumbing (copy → splice → import → probe, plus an
// in-file mutant). The family form now does that through `tests/_lib/falsify.mjs`, so the file states only the
// INVARIANT and the DEFECTS. The in-file/laboratory self-proofs live in `tests/vmu-activity-falsify-lib.test.mjs`.
//
// ONE probe, three invariants (each with a control direction):
//   · FUTURE-ONLY — a notification from BEFORE the wait never wakes it; the wait ends on its own timeout;
//   · ONE-SHOT    — after the wake the waiter is unregistered, so a second notification wakes NOBODY (0, not 1);
//   · DISPOSER    — the wake branch ran the timer disposer exactly once (the "disposer in both outcomes" rule).
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ACTIVITY = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'activity.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const tick = () => new Promise((r) => setTimeout(r, 0))

/** A deterministic harness for any `createActivity`-shaped factory: fake clock, fake timer, counted disposers. */
function probeHarness(factory) {
  let t = 0
  const timers = new Map()
  const disposerCalls = []
  let seq = 0
  const timer = { timeout(cb, ms) { const id = ++seq; timers.set(id, { cb, ms }); return () => { disposerCalls.push(id); timers.delete(id) } } }
  const activity = factory({ clock: () => t, log: () => {}, settings: {}, timer, bus: null })
  return {
    activity,
    notify: (n) => activity.notify(n),
    wait: (o) => activity.wait(o),
    advance: (ms) => { t += ms },
    fire: () => { const e = [...timers.entries()][0]; if (!e) return false; timers.delete(e[0]); e[1].cb(); return true },
    disposers: () => disposerCalls.length,
  }
}

async function activityProbe(mod) {
  // (a) FUTURE-ONLY: history first, then a wait that must NOT be woken by it.
  const h = probeHarness(mod.createActivity)
  h.notify({ what: 'history' })
  let settled = null
  const p = h.wait({ timeoutMs: 10000 }).then((r) => { settled = r; return r })
  await tick()
  const wokeOnHistory = settled !== null
  if (!wokeOnHistory) { h.advance(10000); h.fire() }
  const first = await p
  // (b) ONE-SHOT + DISPOSER: one notification wakes the current generation; a second wakes nobody.
  const h2 = probeHarness(mod.createActivity)
  const p2 = h2.wait({ timeoutMs: 10000 })
  h2.notify({ what: 'n1' })
  const woken = await p2
  const second = h2.notify({ what: 'n2' })
  // (c) A TIMED-OUT waiter is spent too: the next notification must report ZERO woken (the timeout path is the only
  //     one where the removal happens solely in `cleanup()`, so this is where "a spent waiter is reusable" shows).
  const h3 = probeHarness(mod.createActivity)
  const p3 = h3.wait({ timeoutMs: 10000 })
  h3.advance(10000)
  h3.fire()
  const timedOutWait = await p3
  const late = h3.notify({ what: 'late' })
  return {
    wokeOnHistory, timedOut: first.timedOut === true,
    wokenTimedOut: woken.timedOut === false,
    waitersAfterWake: h2.activity.status().waiters, secondNotified: second.notified,
    disposersCalled: h2.disposers(),
    timedOutWaitOk: timedOutWait.timedOut === true, waitersAfterTimeout: h3.activity.status().waiters, lateNotified: late.notified,
  }
}

const family = await falsifyFamily({
  name: 'activity — future-only, one-shot, and the disposer runs on the wake branch',
  cases: [{
    name: 'activity.js',
    module: ACTIVITY,
    probe: activityProbe,
    controlFields: ['timedOut', 'wokenTimedOut', 'disposersCalled'],
    mutations: [
      { label: 'history is replayed as news', name: 'activity-history',
        find: 'waiters.add(entry)',
        replace: 'waiters.add(entry)\n        if (lastNotification) { settle(() => resolve({ ok: true, timedOut: false, historical: true, notified: { what: lastNotification.what, seq: lastNotification.seq, at: lastNotification.at }, timeoutMs: ms, clamped, member: memberId || null, reason: why, peerCheck })); return }' },
      // NOTE (measured while writing this file): mutating `waiters.clear()` ALONE is a NO-OP — every settled waiter
      // also removes itself in `cleanup()`, so the set empties either way, and the library correctly reported
      // PROBE-DOES-NOT-DISCRIMINATE. The load-bearing deletion is the one in `cleanup()` (it appears twice: the
      // normal settle path and the timer-arming failure path), so the single defect "a waiter is never unregistered"
      // removes both copies — `occurrences: 2`.
      { label: 'a settled waiter is never unregistered (one-shot broken)', name: 'activity-not-unregistered', occurrences: 2,
        find: '          waiters.delete(entry)\n',
        replace: '          // MUTANT: the settled waiter stays in the live set\n' },
      { label: 'the timer disposer is disabled on every branch', name: 'activity-disposer',
        find: '          if (timerDisposer) {', replace: '          if (false && timerDisposer) {   // MUTANT: no cleanup' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated waiter is future-only, one-shot, and cleans up ===')
ok(family.cases[0].real.wokeOnHistory === false && family.cases[0].real.timedOut === true,
  '★ a notification from BEFORE the wait does not wake it, and the wait ends on its own timeout', family.cases[0].real)
ok(family.cases[0].real.wokenTimedOut === true && family.cases[0].real.waitersAfterWake === 0 && family.cases[0].real.secondNotified === 0,
  '★ one notification wakes the current generation and unregisters it: a second wakes NOBODY', family.cases[0].real)
ok(family.cases[0].real.timedOutWaitOk === true && family.cases[0].real.waitersAfterTimeout === 0 && family.cases[0].real.lateNotified === 0,
  '★ a TIMED-OUT waiter is spent as well: a later notification reports ZERO woken (nothing is reusable)', family.cases[0].real)
ok(family.cases[0].real.disposersCalled === 1, 'and the wake branch ran the timer disposer exactly once (control direction)', family.cases[0].real)

console.log('=== FALSIFICATION: replay history, keep the waiter, or drop the disposer ===')
ok(family.ok, '★ all three activity mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const historyRed = byLabel('history is replayed') && byLabel('history is replayed').red
const reuseRed = byLabel('never unregistered') && byLabel('never unregistered').red
const disposerRed = byLabel('disposer is disabled') && byLabel('disposer is disabled').red
ok(!!historyRed && historyRed.wokeOnHistory === true, '★ "history replayed": the newcomer is woken by an activity that already happened', historyRed)
ok(!!reuseRed && reuseRed.lateNotified === 1 && reuseRed.secondNotified === 0,
  '★ "never unregistered": a spent (timed-out) waiter is still counted as woken by the next notification — while the WOKEN path is unaffected (the mutation is narrow)', reuseRed)
ok(!!disposerRed && disposerRed.disposersCalled === 0, '★ "disposer disabled": the wake branch leaves the timer uncleaned', disposerRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU ACTIVITY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
