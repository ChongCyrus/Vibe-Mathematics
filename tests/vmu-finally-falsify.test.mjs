// tests/vmu-finally-falsify.test.mjs — FAMILY 12: THE REAL `finally` USERS (round 11, task-85).
// Run: node tests/vmu-finally-falsify.test.mjs
//
// WHY THIS FILE EXISTS. Round 10 named the construct honestly: `records`/`store` have NO `finally` at all (a pure
// policy layer that holds nothing across a call), so the only real `finally` users in the kernel worth falsifying are
//
//   · `kernel/index.js`      :1953  `try { return await run } finally { exitFlushInFlight = null }`
//   · `kernel/mathjobs.js`   :587   `try { return await executeInner(job) } finally { releaseSlot() }`
//   · `kernel/mathjobs.js`   :224   the child-budget timer, disposed in a `finally` (its reading is the timer rail)
//
// The question this family answers is the one a `finally` exists FOR: does the resource come back on the exit that
// does NOT fall through the happy path? Both cases therefore read the THROWING exit, with a control that shows the
// happy path still works - and the narrow mutation (happy path untouched, only the throw leaks) is preferred, because
// a mutation that breaks everything proves less than one that breaks exactly the branch under test.
//
// CASE 1 · THE EXIT-FLUSH SINGLE-FLIGHT FLAG. `shutdown()` shares ONE in-flight flush with its callers and clears the
//   flag afterwards, so a LATER call RUNS AGAIN (docs/03 §2: a host may reinstall and produce a new journal tail - a
//   permanent "already flushed" flag would silently lose it). The throwing exit is REACHABLE and is reached here by
//   injecting a clock that throws (the flush stamps itself with `clock()` before anything else), so the flag's
//   clearing is measurable rather than argued: with the real `finally` the NEXT call runs again; with the release
//   moved out of `finally` it keeps returning the rejected promise forever.
// CASE 2 · THE CONCURRENCY RAIL. `executeInner` parks while `running() >= maxParallel` and is woken ONLY by
//   `releaseSlot()`, which the wrapper calls from `finally`. Two jobs with `maxParallel=1`: the second is queued, the
//   first finishes, and the second must START. Both mutations cut the release (the wake-up splice, and the `finally`
//   itself); the second is broad on purpose, the first is the rail's own load-bearing line.
// CASE 2b · THE MEASURED NON-FINDING, asserted (not hidden). `executeInner` converts its failures into RECEIPTS (its
//   own catch returns `VMU_EXTERNAL_UNAVAILABLE`), so no reachable input makes the wrapper throw: the `finally` there
//   is DEFENSIVE. Moving the release onto the success path therefore produces an IDENTICAL reading on every reachable
//   input, and the library says so by name (`PROBE-DOES-NOT-DISCRIMINATE`). That expectation is pinned: if a later
//   refactor lets a throw escape `executeInner`, this pin goes red and the honest mutation becomes available.
import { falsifyFamily, falsify, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'index.js')
const MATHJOBS = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'mathjobs.js')

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
const attempt = async (fn) => { try { return { value: await fn() } } catch (e) { return { code: (e && e.code) || String((e && e.message) || e) } } }

/** CASE 1: shutdown() twice, then once with a clock that THROWS, then once more (the exit under test). */
async function shutdownProbe(mod) {
  const boom = { on: false }
  let ticks = 0
  const clock = () => { if (boom.on) throw new Error('clock down'); return 1000 + (ticks++) }
  const k = mod.createKernel({ clock, settings: {} })
  const first = await attempt(() => k.shutdown({ reason: 'one' }))
  const rec1 = k.exitFlush()
  const second = await attempt(() => k.shutdown({ reason: 'two' }))
  const rec2 = k.exitFlush()
  boom.on = true
  const threw = await attempt(() => k.shutdown({ reason: 'boom' }))
  boom.on = false
  const after = await attempt(() => k.shutdown({ reason: 'after' }))
  const rec3 = k.exitFlush()
  const at = (r) => (r ? r.at : -1)
  const reason = (r) => (r ? r.reason : null)
  return {
    firstOk: !!(first.value && first.value.ok === true),
    firstReason: reason(rec1),
    // the documented shape: a LATER call runs again (a permanent flag would lose a re-installed host's tail)
    secondRunsAgain: reason(rec2) === 'two' && at(rec2) > at(rec1),
    // the throwing exit was really reached: the injected clock surfaced as the rejection
    boomSurfaced: threw.code === 'clock down' && !threw.value,
    // THE EXIT UNDER TEST: after a THROW, the next call must run again (this is what clearing in `finally` buys)
    recoveredAfterThrow: reason(rec3) === 'after' && at(rec3) > at(rec2),
    afterSucceeded: !!(after.value && after.value.ok === true),
  }
}

/** CASE 2: two jobs, maxParallel=1 ⇒ the second PARKS, and only the first one's release can wake it. */
async function mathjobsRailProbe(mod) {
  const pending = []
  const spawn = () => new Promise((resolve) => { pending.push(resolve) })
  const svc = mod.createMathJobs({ clock: () => 1000, log: () => {}, spawn,
    settings: { 'vmu.math.engines': ['fake'], 'vmu.math.maxParallel': 1 } })
  const first = await svc.submit({ engine: 'fake', argv: [], async: true })
  const second = await svc.submit({ engine: 'fake', argv: [], async: true })
  await tick()
  const parkedState = svc.status({ jobId: second.jobId }).job.state
  const spawnedWhileParked = pending.length
  if (pending[0]) pending[0]({ exitCode: 0, stdout: 'a', stderr: '' })     // the FIRST job finishes here
  await tick(); await tick(); await tick()
  const afterState = svc.status({ jobId: second.jobId }).job.state
  const firstState = svc.status({ jobId: first.jobId }).job.state
  return {
    firstStarted: !!first && first.ok === true && firstState !== 'queued',
    parkedState, spawnedWhileParked,
    // THE READING: the released slot really handed over to the parked job
    parkedIsQueued: parkedState === 'queued' && spawnedWhileParked === 1,
    parkedJobStarted: afterState === 'running' && pending.length === 2,
  }
}

const family = await falsifyFamily({
  name: 'the real finally users — the exit-flush flag and the concurrency rail',
  cases: [{
    name: 'index.js — shutdown() clears the single-flight flag in `finally`',
    module: KERNEL,
    probe: shutdownProbe,
    controlFields: ['firstOk', 'secondRunsAgain', 'boomSurfaced', 'recoveredAfterThrow'],
    mutations: [
      // NARROW: the happy path still clears the flag (the clear runs after the await), so ONLY the throwing exit leaks.
      { label: 'the flag is cleared on the success path only (no finally)', name: 'shutdown-no-finally',
        find: '      try { return await run } finally { exitFlushInFlight = null }',
        replace: '      const out = await run   // MUTANT: no `finally` — a throwing exit leaves the flag set\n      exitFlushInFlight = null\n      return out' },
      // BROAD: the flag is never cleared at all ⇒ even the happy path stops running again.
      { label: 'the flag is never cleared at all', name: 'shutdown-flag-sticky',
        find: '      try { return await run } finally { exitFlushInFlight = null }',
        replace: '      try { return await run } finally { /* MUTANT: the flag is never cleared */ }' },
    ],
  }, {
    name: 'mathjobs.js — the slot is released on every exit of `execute`',
    module: MATHJOBS,
    probe: mathjobsRailProbe,
    controlFields: ['firstStarted', 'parkedIsQueued', 'parkedJobStarted'],
    mutations: [
      { label: 'the release wakes nobody (the rail stops handing over)', name: 'mathjobs-release-noop',
        find: 'const w = slotWaiters.splice(0)', replace: 'const w = []' },
      { label: 'the slot is never released', name: 'mathjobs-finally-noop',
        find: 'try { return await executeInner(job) } finally { releaseSlot() }',
        replace: 'try { return await executeInner(job) } finally { /* MUTANT: the slot is never released */ }' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated kernel recovers from the throwing exit ===')
const s = family.cases[0].real
ok(s.firstOk === true && s.firstReason === 'one',
  '★ a first shutdown really flushes and records itself', s)
ok(s.secondRunsAgain === true,
  '★ a LATER shutdown RUNS AGAIN (the flag is cleared after a settled run — a permanent flag would lose a reinstalled host\\\'s tail)', s)
ok(s.boomSurfaced === true,
  '★ the throwing exit is REACHABLE (the injected clock throws inside the flush, and the rejection surfaces)', s)
ok(s.recoveredAfterThrow === true && s.afterSucceeded === true,
  '★ and after that throw the NEXT shutdown runs again — this is exactly what clearing the flag in `finally` buys', s)

console.log('=== CONTROL GROUP: the unmutated rail hands the slot to the parked job ===')
const r = family.cases[1].real
ok(r.firstStarted === true && r.parkedIsQueued === true,
  '★ with maxParallel=1 the second job is genuinely PARKED (queued, no spawn) while the first runs', r)
ok(r.parkedJobStarted === true,
  '★ when the first job finishes, the released slot starts the parked job (two spawns, second state=running)', r)

console.log('=== FALSIFICATION: move the release out of `finally`, or cut it ===')
ok(family.ok, '★ all four `finally` mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((x) => x.label.includes(needle))
const noFinallyRed = byLabel('success path only') && byLabel('success path only').red
const stickyRed = byLabel('never cleared at all') && byLabel('never cleared at all').red
const releaseNoopRed = byLabel('wakes nobody') && byLabel('wakes nobody').red
const releaseGoneRed = byLabel('slot is never released') && byLabel('slot is never released').red
ok(!!noFinallyRed && noFinallyRed.recoveredAfterThrow === false && noFinallyRed.secondRunsAgain === true && noFinallyRed.boomSurfaced === true,
  '★ "no finally": the THROWING exit leaks the in-flight promise — the next shutdown returns the stale rejection — while the happy path is untouched (the mutation is narrow)', noFinallyRed)
ok(!!stickyRed && stickyRed.secondRunsAgain === false && stickyRed.recoveredAfterThrow === false && stickyRed.firstOk === true,
  '★ "sticky flag": even a settled run is never cleared, so the SECOND shutdown silently returns the first flush\\\'s promise', stickyRed)
ok(!!releaseNoopRed && releaseNoopRed.parkedIsQueued === true && releaseNoopRed.parkedJobStarted === false && releaseNoopRed.spawnedWhileParked === 1,
  '★ "the release wakes nobody": the parked job stays queued forever and is never spawned (the rail stalls silently)', releaseNoopRed)
ok(!!releaseGoneRed && releaseGoneRed.parkedJobStarted === false && releaseGoneRed.firstStarted === true,
  '★ "the slot is never released": the first job still runs to completion, and the queue behind it never moves', releaseGoneRed)
ok(family.results.length > 0 && family.results.every((x) => x.applied && x.importable && x.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((x) => ({ label: x.label, applied: x.applied, importable: x.importable })))
ok(family.cases.length > 0 && family.cases.every((c) => c.leftovers.length === 0),
  'the mutated copies were written to D:\\_tmp and deleted again', family.cases.map((c) => c.leftovers))

console.log('=== MEASURED NON-FINDING (pinned): the mathjobs wrapper `finally` is DEFENSIVE ===')
// `executeInner` swallows every internal failure into a receipt (its catch returns VMU_EXTERNAL_UNAVAILABLE) and the
// `async:true` path additionally catches a rejection, so NO reachable input makes the wrapper throw. The honest
// conclusion is therefore not "I could not falsify it" but "moving the release onto the success path is behaviourally
// identical on every reachable input" — and the library names that state. If a refactor ever lets a throw escape
// `executeInner`, this pin goes red: that is the signal that the mutation became real.
const defensive = await falsify({
  name: 'mathjobs — is the wrapper `finally` load-bearing?',
  module: MATHJOBS,
  probe: mathjobsRailProbe,
  mutations: [{ label: 'the slot is released only on the success path', name: 'mathjobs-release-success-only',
    find: 'try { return await executeInner(job) } finally { releaseSlot() }',
    replace: 'const out = await executeInner(job); releaseSlot(); return out' }],
})
ok(defensive.ok === false && defensive.problems.some((p) => p.startsWith('PROBE-DOES-NOT-DISCRIMINATE')),
  '★ measured: `executeInner` returns its failures as receipts, so the wrapper never throws on any reachable input — the success-path-only release is a NO-OP and the library reports PROBE-DOES-NOT-DISCRIMINATE (pin: if a throw becomes reachable, this goes red and the mutation becomes a real defect probe)',
  defensive.problems)
ok(defensive.real && defensive.real.parkedJobStarted === true,
  'and the probe itself is green on the real module (so the non-finding is about the mutation, not a broken probe)', defensive.real)

console.log('')
console.log('=== VMU FINALLY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
