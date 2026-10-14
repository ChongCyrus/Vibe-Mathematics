// tests/vmu-activity-timers.test.mjs — F15 (timer cleanup on EVERY branch) and F16 (scheduling trampoline).
// Run: node tests/vmu-activity-timers.test.mjs   Last line: === VMU TIMERS F15/F16: N passed, M failed ===
//
// WHY THIS FILE EXISTS. `_handoff/vmu/05-framework-strength-evidence.md` judged F15/F16 "具备" from CODE READING
// (round 3's own note says so: "F16 的'等价'判定是推理，不是探针实测"). This is the probe half:
//   §1 a DERIVED inventory of every timer site in the framework (so a new one cannot appear unnoticed) with an
//      explicit verdict per site;
//   §2 F15 on `kernel/scheduler.js`: the timer's FIRE branch releases its handle, and a recurring item can be
//      re-armed (the round-4 fix; before it the handle stayed counted forever and the item went quiet after one run);
//   §3 F16 on `kernel/scheduler.js`: a re-entrant `tick()` is DEFERRED into another pass of the running tick — no
//      nesting, no double fire, and the missed trigger is picked up by that next pass;
//   §4 F15 on `kernel/bus.js`: the one hook-budget `setTimeout` is released on BOTH branches (measured with
//      `process.getActiveResourcesInfo()`, so "no armed timer is left" is a reading and not a promise);
//   §5 the timer sites OUTSIDE this task's write scope, NAMED with their file:line (the discipline the task allows:
//      修 or 具名列出) — plus the integration gap that no production caller ever arms/ticks the scheduler.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripComments } from './_lib/strip-comments.mjs'
import { createScheduler } from '../vibe-math-vmu/kernel/scheduler.js'
import { createBus } from '../vibe-math-vmu/kernel/bus.js'
import { createChildBudget } from '../vibe-math-vmu/kernel/mathjobs.js'
import { createHostSpawn } from '../vibe-math-vmu/host-spawn.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})
function fakeClock(start = 0) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }
function fakeTimer() {
  const armed = []; const cleared = []
  return {
    armed, cleared,
    arm({ at, delayMs, onFire }) { const h = { at, delayMs, onFire, id: 'h-' + (armed.length + 1) }; armed.push(h); return h },
    disarm(h) { cleared.push(h); return true },
  }
}
const S = (extra = {}) => Object.assign({ 'vmu.schedule.maxPending': 8 }, extra)
const liveTimeouts = () => (typeof process.getActiveResourcesInfo === 'function'
  ? process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length : -1)

console.log('=== 1. EVERY TIMER SITE IN THE FRAMEWORK IS INVENTORIED AND CLASSIFIED (derived, not hand-listed) ===')
// The scan reads CODE ONLY (comments and string literals blanked by the repository's own stripper), so a doc comment
// that mentions setTimeout cannot fake a site and a real one cannot hide behind a string.
const VERDICT = {
  'kernel/bus.js': { timers: 1, clears: 1, verdict: 'finally-clear', note: 'the hook budget is cleared in `finally`, so a fast hook and a timed-out hook both release it (probe §4)' },
  'kernel/activity.js': { timers: 1, clears: 1, verdict: 'cleanup-on-every-branch', note: 'the platform fallback is armed through the one cleanup(); success/timeout/abort/arming-failure all run it (probe: tests/vmu-activity-kernel.test.mjs §1/§2/§5/§7)' },
  'kernel/scheduler.js': { timers: 0, clears: 0, verdict: 'seam-only', note: 'no GLOBAL timer at all (the `timer.setTimeout` calls are the seam dispatcher): every handle path (fire/cancel/disarm) releases it (probes §2)' },
  'kernel/mathjobs.js': { timers: 1, clears: 2, verdict: 'disposer-default-FIXED', note: 'the default budget seam now returns a real disposer (`() => clearTimeout(h)`, mathjobs.js:125-126) and `disposeTimer` also clears a raw Timeout object (:132-133); the third named finding is therefore CLOSED, and §5 keeps a regression probe (success branch leaves nothing armed, timeout branch still fires and releases)' },
  'host-spawn.js': { timers: 2, clears: 1, verdict: 'budget-FIXED', note: 'the DEFAULT budget timer now has its own handle, is `unref`ed, and is cleared in `finally` with a NAMED failure (`VMU_SPAWN_TIMER_CLEANUP`): host-spawn.js:49,191,216-224 — the finding is CLOSED, and §5 keeps a regression probe' },
  'math-computation.js': { timers: 2, clears: 0, verdict: 'NAMED-FINDING-uncancellable', note: 'two awaited sleeps with no handle bound, so no abort path can release them (math-computation.js:617,728) — named in §5' },
}
{
  const files = walk('vibe-math-vmu').filter((f) => f.endsWith('.js'))
  const siteOf = {}
  let intervalTotal = 0
  // CODE ONLY (comments/strings blanked), and only the GLOBAL timer functions: `timer.setTimeout(...)` is a seam
  // DISPATCH, not a timer site — counting it would hide the real ones behind a naming coincidence.
  const globalTimers = (code) => (code.match(/(?<![\w$.])setTimeout\s*\(/g) || []).length
  const globalClears = (code) => (code.match(/(?<![\w$.])clearTimeout\s*\(/g) || []).length
  for (const rel of files) {
    const key = rel.replace(/\\/g, '/').replace('vibe-math-vmu/', '')
    const code = stripComments(readFileSync(join(REPO, rel), 'utf8'), { strings: true })
    const timers = globalTimers(code)
    const clears = globalClears(code)
    intervalTotal += (code.match(/(?<![\w$.])setInterval\s*\(/g) || []).length
    if (timers > 0 || clears > 0) siteOf[key] = { timers, clears }
  }
  const known = Object.keys(VERDICT)
  const found = Object.keys(siteOf)
  const unclassified = found.filter((f) => !known.includes(f))
  // A row that declares ZERO sites is a declaration of ABSENCE (`kernel/scheduler.js` uses only the seam), so it is
  // not "stale" when the scan cannot see it — a row that declares a real site must still be found.
  const stale = known.filter((f) => !found.includes(f) && (VERDICT[f].timers > 0 || VERDICT[f].clears > 0))
  ok(unclassified.length === 0, '★ every file that creates or clears a GLOBAL timer is CLASSIFIED (a new timer site cannot appear unnoticed — this scan found `kernel/mathjobs.js`, which the first hand-grep had missed)', { unclassified, found })
  ok(stale.length === 0, 'and no classified row is stale (a removed timer site must be removed from the table too)', stale)
  // RULE E (round 4, vmu-verify's fingerprint `A:for:known`): the per-row comparison used to be one `ok(...)` per
  // iteration, so an EMPTY `known` table made the whole check vanish. The mismatches are now ACCUMULATED and the
  // table is pinned non-empty in the same assertion, so "every row agrees" cannot be true of zero rows.
  const mismatches = known.filter((key) => siteOf[key]
    && (siteOf[key].timers !== VERDICT[key].timers || siteOf[key].clears !== VERDICT[key].clears))
    .map((key) => key + ': found ' + JSON.stringify(siteOf[key]) + ' vs declared ' + JSON.stringify({ timers: VERDICT[key].timers, clears: VERDICT[key].clears }))
  ok(known.length > 0 && known.length === Object.keys(VERDICT).length && mismatches.length === 0,
    'the classification table is non-empty AND every declared row matches the scan (non-vacuous: an empty table cannot pass this)',
    { rows: known.length, mismatches })
  ok(intervalTotal === 0, '★ the framework has ZERO setInterval sites (the class that is hardest to clean up does not exist)', intervalTotal)
  const leaks = known.filter((k) => VERDICT[k].verdict.startsWith('NAMED-FINDING'))
  ok(leaks.length === 1, 'one site remains a NAMED finding (outside this task write scope); `kernel/mathjobs.js` and `host-spawn.js` were the other two and are now FIXED by their owners', leaks)
  ok(found.length === 5, 'five framework files touch a GLOBAL timer, and all five are accounted for (scheduler.js is the sixth row: it declares zero)', found)
}

console.log('=== 2. F15 · THE SCHEDULER RELEASES ITS HANDLE ON THE FIRE BRANCH (and every other branch) ===')
{
  const c = fakeClock(0)
  const timer = fakeTimer()
  const s = createScheduler({ clock: c.clock, settings: S(), timer })
  const it = s.every({ intervalMs: 1000, what: 'lab/heartbeat', maxRuns: 3 })
  ok(s.arm().armedIds.join(',') === it.id && s.status().timerHandles === 1, 'a recurring item is armed (one handle)')
  c.advance(1000)
  timer.armed[0].onFire()
  ok(s.status().timerHandles === 0, '★ the FIRE branch released the handle (before round 4 it stayed in the map forever)', s.status().timerHandles)
  ok(timer.cleared.length === 1, 'and the host seam was asked to release it (the same "disposer in both outcomes" discipline)', timer.cleared.length)
  ok(s.status().timerFired === 1, 'the fire is counted and reported by status()', s.status().timerFired)
  ok(s.list().items[0].runs === 1 && s.list().items[0].state === 'pending', 'the recurring item ran once and is still pending (maxRuns 3)')
  ok(s.arm().armedIds.join(',') === it.id, '★ and it can be RE-ARMED for the next occurrence (before the fix arm() skipped any item that held a handle)', s.status().timerHandles === 1)
  // the other branches: cancel and disarm still release, and arm-all covers every pending item
  const c2 = fakeClock(0); const t2 = fakeTimer()
  const s2 = createScheduler({ clock: c2.clock, settings: S(), timer: t2 })
  const a = s2.once({ inMs: 100, what: 'lab/a' }); const b = s2.once({ inMs: 200, what: 'lab/b' })
  s2.arm({ id: a.id }); s2.arm({ id: b.id })
  ok(s2.status().timerHandles === 2, 'two items can hold two handles')
  const cancelled = s2.cancel({ id: a.id, by: 'm1', reason: 'no longer needed' })
  ok(cancelled.timerCleared === true && t2.cleared.length === 1, 'CANCEL releases the handle and reports it', cancelled.timerCleared)
  const disarmed = s2.disarm()
  ok(disarmed.count === 1 && t2.cleared.length === 2 && s2.status().timerHandles === 0, 'DISARM (all) releases the rest', disarmed)
  ok(s2.list().items.find((x) => x.id === b.id).state === 'pending', 'and disarming is still not cancelling')
}

console.log('=== 3. F16 · THE TRAMPOLINE: a re-entrant tick is deferred, and the missed trigger is picked up next pass ===')
{
  const c = fakeClock(0)
  let s = null
  const nested = []
  const bus = { emit: () => { nested.push(s.tick()) }, declareTopic: () => ({ ok: true }) }
  s = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.triggerVia': 'middleware' }), bus })
  const it = s.once({ inMs: 0, what: 'lab/heartbeat' })
  const r = s.tick()
  ok(r.passes === 2 && r.reentrantDeferred === 1, '★ the re-entrant call is DEFERRED, so the outer tick runs a SECOND pass instead of nesting', { passes: r.passes, deferred: r.reentrantDeferred })
  ok(r.firedCount === 1, 'the item fired exactly ONCE (no double fire, no lost fire)', r.firedCount)
  ok(s.list().items[0].runs === 1 && s.list().items[0].state === 'completed', 'runs === 1 and the one-shot completed once', s.list().items[0].runs)
  ok(nested.length === 1 && nested[0].deferred === true && nested[0].passes === 0 && /DEFERRED/.test(nested[0].note),
    '★ the re-entrant caller got an explicit DEFERRED receipt (nothing is silently swallowed)', nested[0])
  ok(s.status().reentrantDeferred === 1 && s.status().tickPasses === 2, 'status() reports the deferral and the pass count (never silent)', { d: s.status().reentrantDeferred, p: s.status().tickPasses })
  // MANY re-entrant requests inside ONE pass collapse into ONE extra pass (the flag, not a queue): bounded work.
  const c2 = fakeClock(0)
  let s2 = null
  let calls = 0
  const bus2 = { emit: () => { calls += 1; s2.tick(); s2.tick(); s2.tick() }, declareTopic: () => ({ ok: true }) }
  s2 = createScheduler({ clock: c2.clock, settings: S({ 'vmu.schedule.triggerVia': 'middleware' }), bus: bus2 })
  s2.once({ inMs: 0, what: 'lab/x' })
  const r2 = s2.tick()
  ok(r2.passes === 2 && r2.reentrantDeferred === 3, 'three re-entrant requests in one pass still resolve in ONE extra pass (passes bounded, all counted)', { passes: r2.passes, deferred: r2.reentrantDeferred })
  ok(r2.firedCount === 1 && calls === 1, 'and the item still fired once', { fired: r2.firedCount, emitCalls: calls })
  // a trigger that becomes due DURING a pass is picked up by the next pass
  const c3 = fakeClock(0)
  const s3 = createScheduler({ clock: c3.clock, settings: S(), timer: null })
  s3.once({ inMs: 0, what: 'lab/first' })
  const r3 = s3.tick()
  ok(r3.passes === 1 && r3.reportedCount === 1 && r3.pending === 0, 'a normal tick is exactly ONE pass (the trampoline adds a pass only when something asked for it)', { passes: r3.passes, reported: r3.reportedCount })
}

console.log('=== 4. F15 · THE HOOK BUDGET TIMER IS RELEASED ON BOTH BRANCHES (measured, not promised) ===')
{
  ok(liveTimeouts() >= 0, 'the runtime exposes active-resource counts, so "no armed timer is left" is measurable here')
  const bus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 4000 } })
  bus.add({ id: 'fast-hook', kind: 'module', on: ['chat/sent'], failure: 'open', handler: () => undefined })
  const before = liveTimeouts()
  const res = await bus.emit('chat/sent', {})
  const after = liveTimeouts()
  ok(res.ok === true, 'the fast hook ran')
  ok(after === before, '★ the SUCCESS branch leaves no armed timeout behind (the budget timer was cleared in `finally`)', { before, after })
  // the timeout branch: a hook that never returns must be cut off by the budget, and the timer must be gone too
  const bus2 = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 20 } })
  bus2.add({ id: 'slow-hook', kind: 'module', on: ['chat/sent'], failure: 'open', handler: () => new Promise(() => {}) })
  const before2 = liveTimeouts()
  const res2 = await bus2.emit('chat/sent', {})
  const after2 = liveTimeouts()
  ok(res2.ok === true, 'a hook that exceeds its budget is dropped from the pass (failure policy open ⇒ the chain continues)')
  ok(after2 === before2, '★ and the TIMEOUT branch also leaves nothing armed (finally ran on the way out)', { before: before2, after: after2 })
}

console.log('=== 5. THE NAMED FINDINGS: two CLOSED by their owners (regression-guarded here), one still open ===')
{
  // The budgets are SHORT on purpose: a leaked timer would expire inside this suite instead of holding the process
  // open (each probe waits it out), and a short budget keeps the whole file fast.
  const settle = (ms) => new Promise((r) => setTimeout(r, ms))
  // (a) host-spawn.js — CLOSED by its owner (round 4): the default budget timer has its own handle and is cleared in
  //     `finally` (host-spawn.js:191,216-224). The regression probe checks BOTH directions: a settled process leaves
  //     nothing armed, and a process that never settles still times out (so "nothing armed" cannot be vacuous).
  const ctx = { get: () => ({ spawn: () => ({ done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } }, terminate: async () => {}, stdin: null }) }) }
  const seam = createHostSpawn({ ctx })
  const before = liveTimeouts()
  const r = await seam({ file: 'node', args: ['-e', '0'], timeoutMs: 250 })
  const after = liveTimeouts()
  console.log('  measured (host-spawn): settled=' + (r.timedOut === false) + ' liveTimeouts before=' + before + ' after=' + after + ' (delta ' + (after - before) + ')')
  ok(r.timedOut === false && after === before,
    '★ F15 REGRESSION GUARD (host-spawn.js:191,216-224 — the finding is FIXED): a SUCCESSFUL spawn leaves NO armed budget timer (`after === before`)',
    { before, after })
  const stuckCtx = { get: () => ({ spawn: () => ({ done: new Promise(() => {}), collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } }, terminate: async () => {}, stdin: null }) }) }
  const stuckSeam = createHostSpawn({ ctx: stuckCtx })
  // The seam `unref`s its own budget timer (host-spawn.js:192), so a test that awaits a NEVER-settling process needs
  // something else to keep the loop alive — otherwise Node exits with "unsettled top-level await" (code 13). The
  // keep-alive is inside BOTH measurements, so the delta stays a pure budget-timer reading.
  const keepAlive = setTimeout(() => {}, 300)
  const beforeStuck = liveTimeouts()
  const stuck = await stuckSeam({ file: 'node', args: ['-e', '0'], timeoutMs: 40 })
  const afterStuck = liveTimeouts()
  clearTimeout(keepAlive)
  ok(stuck.timedOut === true && afterStuck === beforeStuck,
    'and a process that never settles still TIMES OUT on the budget while leaving nothing armed (non-vacuous: the default timer really arms)',
    { timedOut: stuck.timedOut, before: beforeStuck, after: afterStuck })
  await settle(120)   // let anything a failed clear would have left expire before the next baseline
  // (b) kernel/mathjobs.js — CLOSED by its owner (round 4): the default budget seam now returns a real disposer
  //     (`() => clearTimeout(h)`) and `disposeTimer` clears a raw Timeout object too. What remains here is the
  //     REGRESSION PROBE the finding's own text asked for: the success branch must leave nothing armed, and the
  //     timeout branch must still FIRE (otherwise "no leak" would be vacuous — a seam that never arms proves nothing).
  const beforeM = liveTimeouts()
  const noSeam = createChildBudget({})
  const settled = await noSeam({ call: async () => 'ok', timeoutMs: 250, label: 'probe' })
  const afterM = liveTimeouts()
  console.log('  measured (mathjobs): settled=' + (settled.timedOut === false) + ' liveTimeouts before=' + beforeM + ' after=' + afterM + ' (delta ' + (afterM - beforeM) + ')')
  const withSeam = createChildBudget({ timer: (cb, ms) => { const h = setTimeout(cb, ms); return () => clearTimeout(h) } })
  const beforeS = liveTimeouts()
  await withSeam({ call: async () => 'ok', timeoutMs: 250, label: 'probe' })
  const afterS = liveTimeouts()
  ok(settled.timedOut === false && settled.cleanupFailed === null && afterM === beforeM,
    '★ F15 REGRESSION GUARD (mathjobs.js:125-126,132-133 — the finding is FIXED): with the DEFAULT seam a settled call leaves NO armed timer (`after === before`)',
    { before: beforeM, after: afterM, cleanupFailed: settled.cleanupFailed })
  const beforeT = liveTimeouts()
  const neverSettles = createChildBudget({})
  const timedOutReceipt = await neverSettles({ call: () => new Promise(() => {}), timeoutMs: 30, label: 'probe-timeout' })
  const afterT = liveTimeouts()
  ok(timedOutReceipt.timedOut === true && afterT === beforeT,
    'and the DEFAULT seam still FIRES on the timeout branch (non-vacuous: it really arms) while leaving nothing behind', { timedOut: timedOutReceipt.timedOut, before: beforeT, after: afterT })
  ok(afterS === beforeS, 'and an injected disposer-shaped seam behaves identically (the two paths agree)', { before: beforeS, after: afterS })
  await settle(350)   // the default-seam leak expires here too
  // (c) math-computation.js:617,728 — two awaited sleeps with no handle bound, so no abort can release them.
  const mathCode = stripComments(readFileSync(join(VMU, 'math-computation.js'), 'utf8'), { strings: true })
  const slept = (mathCode.match(/setTimeout\s*\(resolve/g) || []).length
  ok(slept === 2 && /await new Promise\(\(resolve\) => setTimeout\(resolve/.test(mathCode),
    '★ F15 FINDING (math-computation.js:617,728): two `await new Promise(resolve => setTimeout(resolve, …))` sleeps bind no handle ⇒ uncancellable on abort (named, not fixed: outside this task write scope)',
    slept)
  // (c) THE INTEGRATION GAP: no production caller ever arms or ticks the scheduler, so the timer path is only
  //     exercised by this suite and tests/vmu-scheduler.test.mjs — the F15/F16 properties are real but UNDRIVEN.
  const drivers = walk('vibe-math-vmu').filter((f) => f.endsWith('.js') && !/kernel[\\/]scheduler\.js$/.test(f))
    .filter((f) => /\bscheduler\s*\.\s*(arm|tick|disarm|cancel)\s*\(/.test(stripComments(readFileSync(join(REPO, f), 'utf8'), { strings: true })))
  ok(drivers.length === 0 && /\bscheduler\s*\.\s*(arm|tick|disarm|cancel)\s*\(/.test(readFileSync(join(VMU, 'kernel', 'scheduler.js'), 'utf8')) === false,
    '★ F15/F16 INTEGRATION GAP (named): NOTHING in the shipped framework (host/tools/entry) calls scheduler.arm()/tick()/disarm() — the timer discipline is real but has no production driver (the tool face has no scheduler action)',
    drivers)
}

console.log('')
console.log('=== VMU TIMERS F15/F16: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
