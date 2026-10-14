// tests/vmu-activity-falsify.test.mjs — the "can this assertion go RED?" half of the activity waiter.
//
// WHY A SEPARATE FILE. `tests/vmu-activity-kernel.test.mjs` asserts that a notification from BEFORE a wait does not
// wake it, and that the timeout disposer runs on every branch. An assertion nobody has ever seen fail is a claim, not
// a gate — this project's own rule. So the SAME probes are run against a deliberately WRONG implementation:
//   · M1 (source mutation) `kernel/activity.js` with the historical-replay defect spliced in: a newcomer is resolved
//     from the last notification that already happened. It must be RED on the future-only probe.
//   · M2 (source mutation) `kernel/activity.js` with the timer disposer disabled. It must be RED on the disposer probe.
//   · plus an IN-FILE mutant, so the detector itself is shown to fire even if the file-level mutation could not run.
// The mutated copies live in `D:\_tmp` (the declared temp area), are imported by absolute URL, and are deleted in a
// `finally`. Nothing under the repository is written except this file's own suite output.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createActivity } from '../vibe-math-vmu/kernel/activity.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ACTIVITY = join(REPO, 'vibe-math-vmu', 'kernel', 'activity.js')
const BUS = join(REPO, 'vibe-math-vmu', 'kernel', 'bus.js')
const TMP = 'D:\\_tmp'

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
    pending: () => timers.size,
    disposers: () => disposerCalls.length,
  }
}

/**
 * THE PROBE. Returns `{ wokeOnHistory, timedOut }`.
 * A correct implementation: a notification that happened BEFORE the wait leaves `wokeOnHistory === false`, and the wait
 * then ends on its own timeout. A historical-replay implementation flips `wokeOnHistory` to true. 1000 ms guard so a
 * hung implementation is reported instead of hanging the suite.
 */
async function futureOnlyProbe(mk) {
  const h = mk()
  h.notify({ what: 'history' })
  let settled = null
  const p = h.activity.wait({ timeoutMs: 10000 }).then((r) => { settled = r; return r })
  await tick()
  const wokeOnHistory = settled !== null
  if (!wokeOnHistory) { h.advance(10000); h.fire() }
  const r = await Promise.race([p, new Promise((res) => setTimeout(() => res({ hung: true }), 1000))])
  return { wokeOnHistory, timedOut: r.timedOut === true, hung: r.hung === true }
}

/** THE SECOND PROBE: the disposer must run on the wake branch AND on the timeout branch. Returns the two readings. */
async function disposerProbe(mk) {
  const onWake = mk()
  const pw = onWake.activity.wait({ timeoutMs: 10000 })
  onWake.notify({ what: 'n' })
  await pw
  const onTimeout = mk()
  const pt = onTimeout.activity.wait({ timeoutMs: 10000 })
  onTimeout.advance(10000)
  onTimeout.fire()
  await pt
  return { onWake: onWake.disposers(), onTimeout: onTimeout.disposers() }
}

/** The defect shape, inline: the last notification that already happened resolves a NEWCOMER. */
function makeHistoricalActivity() {
  const waiters = new Set()
  let last = null
  return {
    notify({ what = 'x' } = {}) {
      last = { what, seq: (last ? last.seq : 0) + 1 }
      const pending = [...waiters]
      waiters.clear()
      for (const w of pending) w({ timedOut: false, notified: last })
      return { notified: pending.length }
    },
    wait({ timeoutMs = 10000 } = {}) {
      return new Promise((resolve) => {
        if (last) { setTimeout(() => resolve({ timedOut: false, notified: last }), 0); return }   // ← the defect
        waiters.add(resolve)
        setTimeout(() => { waiters.delete(resolve); resolve({ timedOut: true }) }, timeoutMs)
      })
    },
  }
}

console.log('=== 0. THE PROBES ARE READ AND THE REAL MODULE PASSES THEM ===')
ok(typeof createActivity === 'function', 'the real factory is importable')
const realFuture = await futureOnlyProbe(() => probeHarness(createActivity))
ok(realFuture.wokeOnHistory === false && realFuture.timedOut === true && realFuture.hung === false,
  '★ GREEN baseline: the real module is NOT woken by a notification from before the wait, and ends on its timeout', realFuture)
const realDisposers = await disposerProbe(() => probeHarness(createActivity))
ok(realDisposers.onWake === 1 && realDisposers.onTimeout === 1,
  '★ GREEN baseline: the real module runs the disposer exactly once on the wake branch and once on the timeout branch', realDisposers)

console.log('=== 1. THE DETECTOR FIRES ON AN IN-FILE MUTANT (self-proof of the probe) ===')
const inlineMutant = await futureOnlyProbe(() => {
  const activity = makeHistoricalActivity()
  return Object.assign({ activity }, {
    notify: (n) => activity.notify(n),
    wait: (o) => activity.wait(o),
    advance: () => {}, fire: () => false, pending: () => 0, disposers: () => 0,
  })
})
ok(inlineMutant.wokeOnHistory === true,
  '★ the SAME probe reports the historical-replay defect as wokeOnHistory=true (so section 0 can fail)', inlineMutant)

console.log('=== 2. THE REAL MODULE IS FALSIFIABLE: MUTATE IT ON DISK ===')
const SRC = readFileSync(ACTIVITY, 'utf8')
const BUS_URL = pathToFileURL(BUS).href
/** The mutated copy is self-contained: the only relative import (./bus.js) is rewritten to an absolute URL.
 *  The needle is ASSEMBLED rather than written out, because `tests/audit-package-membership.mjs` scans for the
 *  text shape `from '<relative>'` to prove every relative import ships: a data string with that exact shape is
 *  read as an import and reports a false MODULE_NOT_FOUND class. (Same "text parsing ignores context" family as
 *  the generator key-shape defect fixed this round; assembling the needle keeps the gate's real coverage.) */
const FROM = 'from' + ' '
const NEEDLE = FROM + "'./bus.js'"
const selfContained = SRC.replace(NEEDLE, FROM + "'" + BUS_URL + "'")
ok(selfContained !== SRC && !selfContained.includes(NEEDLE), 'the mutant copy no longer depends on the repository path (bus.js is imported by absolute URL)')

const written = []
const writeMutant = (name, text) => {
  mkdirSync(TMP, { recursive: true })
  const file = join(TMP, name)
  writeFileSync(file, text, 'utf8')
  written.push(file)
  return file
}

try {
  // M1 — the historical-replay defect, spliced in at the FUTURE-ONLY MARKER's registration line.
  const ANCHOR = 'waiters.add(entry)'
  ok(SRC.split(ANCHOR).length === 2, 'the mutation anchor (the registration line) occurs exactly once in the source', SRC.split(ANCHOR).length - 1)
  const M1 = [
    'waiters.add(entry)',
    '        // MUTANT M1: a newcomer is resolved from the notification that ALREADY HAPPENED (history as news).',
    '        if (lastNotification) { settle(() => resolve({ ok: true, timedOut: false, historical: true, notified: { what: lastNotification.what, seq: lastNotification.seq, at: lastNotification.at }, timeoutMs: ms, clamped, member: memberId || null, reason: why, peerCheck })); return }',
  ].join('\n')
  const m1File = writeMutant('vmu-activity-m1.mjs', selfContained.replace(ANCHOR, M1))
  const m1 = await import(pathToFileURL(m1File).href)
  ok(typeof m1.createActivity === 'function', 'M1 is importable (the mutation is syntactically real code, not a comment trick)')
  const m1Future = await futureOnlyProbe(() => probeHarness(m1.createActivity))
  ok(m1Future.wokeOnHistory === true,
    '★ M1 (history replayed as news) is RED on the future-only probe — so the assertion in tests/vmu-activity-kernel.test.mjs §1 can fail', m1Future)
  ok(realFuture.wokeOnHistory === false && m1Future.wokeOnHistory === true,
    '★ and the two readings DIFFER, so the probe discriminates rather than always reporting the same verdict', { real: realFuture.wokeOnHistory, m1: m1Future.wokeOnHistory })

  // M2 — the disposer is disabled on every branch: the "disposer runs everywhere" claim must notice.
  const DISPOSER_ANCHOR = 'if (timerDisposer) {'
  ok(SRC.split(DISPOSER_ANCHOR).length === 2, 'the disposer anchor occurs exactly once in the source', SRC.split(DISPOSER_ANCHOR).length - 1)
  const m2File = writeMutant('vmu-activity-m2.mjs', selfContained.replace(DISPOSER_ANCHOR, 'if (false && timerDisposer) {'))
  const m2 = await import(pathToFileURL(m2File).href)
  const m2Disposers = await disposerProbe(() => probeHarness(m2.createActivity))
  ok(m2Disposers.onWake === 0 && m2Disposers.onTimeout === 0,
    '★ M2 (disposer disabled) is RED on the disposer probe on BOTH branches', m2Disposers)
  ok(realDisposers.onWake !== m2Disposers.onWake,
    '★ and the readings differ, so "the disposer runs on every branch" is a measured claim', { real: realDisposers, m2: m2Disposers })

  // A third, independent check: the mutants must NOT be green by accident on the real module's other invariants.
  const m1Harness = probeHarness(m1.createActivity)
  const two = [m1Harness.activity.wait({ timeoutMs: 10000 }), m1Harness.activity.wait({ timeoutMs: 10000 })]
  m1Harness.notify({ what: 'stop' })
  await Promise.all(two)
  ok(m1Harness.pending() === 0, 'and M1 still unregisters its waiters (the mutation is narrow: it rewrites the future-only rule, nothing else)', m1Harness.pending())
} finally {
  for (const f of written) { try { if (existsSync(f)) rmSync(f, { force: true }) } catch (e) { /* reported below */ } }
}
// RULE E (round 3, vmu-verify's finding): `written.every(...)` is vacuous when NOTHING was written, which is exactly
// the "the mutation never happened" failure it must not survive. Both halves are pinned: files WERE written, and
// every one of them is gone again.
ok(written.length > 0 && written.every((f) => !existsSync(f)),
  'the mutated copies were really written and then deleted (non-vacuous: the written list must be non-empty first)',
  { written: written.length, left: written.filter((f) => existsSync(f)) })

console.log('')
console.log('=== VMU ACTIVITY FALSIFICATION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
