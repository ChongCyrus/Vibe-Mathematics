// tests/vmu-activity-falsify-lib.test.mjs — the RUNNABLE EXAMPLE of `tests/_lib/falsify.mjs` (round 4, task-32 C).
// Run: node tests/vmu-activity-falsify-lib.test.mjs   Last line: === VMU FALSIFY LIB: N passed, M failed ===
//
// This file is the paradigm's acceptance test AND its documentation-by-execution:
//   §1 the paradigm's own refusals (a renamed anchor, an unsafe temp root, an unimportable mutant, a no-op mutation)
//      — each one must be reported as a PROBLEM, never mistaken for a successful falsification;
//   §2 the round-3 result reproduced THROUGH the library (`kernel/activity.js` future-only rule);
//   §3 the round-4 fixes proven LOAD-BEARING on `kernel/scheduler.js`: removing the fired-handle release (F15), the
//      trampoline guard (F16), or the deferred-rerun flag (F16) must make the same probe go red.
import { falsify, formatReport, formatFamilyReport, falsifyFamily, familyEligibility, mutateOnce, assertSafeTempRoot, selfContainedSource, DEFAULT_TMP_DIR, FALSIFY_PROBLEM, MINIMAL_FAMILY_EXAMPLE } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ACTIVITY = join(REPO, 'vibe-math-vmu', 'kernel', 'activity.js')
const SCHEDULER = join(REPO, 'vibe-math-vmu', 'kernel', 'scheduler.js')
const TASKS = join(REPO, 'vibe-math-vmu', 'kernel', 'tasks.js')
const STRIP = join(HERE, '_lib', 'strip-comments.mjs')

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

/** A deterministic harness for any `createActivity`-shaped factory (fake clock + fake timer, counted disposers). */
function probeHarness(factory) {
  let t = 0
  const timers = new Map()
  let seq = 0
  const timer = { timeout(cb, ms) { const id = ++seq; timers.set(id, { cb, ms }); return () => { timers.delete(id) } } }
  const activity = factory({ clock: () => t, log: () => {}, settings: {}, timer, bus: null })
  return {
    activity,
    notify: (n) => activity.notify(n),
    wait: (o) => activity.wait(o),
    advance: (ms) => { t += ms },
    fire: () => { const e = [...timers.entries()][0]; if (!e) return false; timers.delete(e[0]); e[1].cb(); return true },
  }
}
function fakeClock(start = 0) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }
function fakeTimer() {
  const armed = []; const cleared = []
  return {
    armed, cleared,
    arm({ at, delayMs, onFire }) { const h = { at, delayMs, onFire, id: 'h-' + (armed.length + 1) }; armed.push(h); return h },
    disarm(h) { cleared.push(h); return true },
  }
}
const SETTINGS = (extra = {}) => Object.assign({ 'vmu.schedule.maxPending': 8 }, extra)

// ── the two probes (the readings the mutations must change) ────────────────────────────────────────────────────
/** F52 / the round-3 probe: does a notification from BEFORE the wait wake it? */
async function futureOnlyReading(mod) {
  const h = probeHarness(mod.createActivity)
  h.notify({ what: 'history' })
  let settled = null
  const p = h.wait({ timeoutMs: 10000 }).then((r) => { settled = r; return r })
  await tick()
  const wokeOnHistory = settled !== null
  if (!wokeOnHistory) { h.advance(10000); h.fire() }
  const r = await p
  return { wokeOnHistory, timedOut: r.timedOut === true }
}
/** F15: after the injected timer fires, is the handle released (and is a recurring item re-armable)? */
async function firedHandleReading(mod) {
  const c = fakeClock(0)
  const timer = fakeTimer()
  const s = mod.createScheduler({ clock: c.clock, settings: SETTINGS(), timer })
  const it = s.every({ intervalMs: 1000, what: 'lab/heartbeat', maxRuns: 3 })
  const first = s.arm()
  c.advance(1000)
  timer.armed[0].onFire()
  const handlesAfterFire = s.status().timerHandles
  const again = s.arm()
  return {
    armedFirst: first.armedIds.length, handlesAfterFire, handlesAfterRearm: s.status().timerHandles,
    timerFired: s.status().timerFired, released: timer.cleared.length, rearmed: again.armedIds.length, runs: s.list().items[0].runs,
  }
}
/** F16: a RE-ENTRANT tick (a hook handler that ticks from inside fire) must be deferred, not nest. */
async function trampolineReading(mod) {
  const c = fakeClock(0)
  const nested = []
  const bus = { emit: () => { nested.push(s.tick()) }, declareTopic: () => ({ ok: true }) }
  const s = mod.createScheduler({ clock: c.clock, settings: SETTINGS({ 'vmu.schedule.triggerVia': 'middleware' }), bus })
  s.once({ inMs: 0, what: 'lab/heartbeat' })
  const r = s.tick()
  return {
    passes: r.passes, deferred: r.reentrantDeferred, fired: r.firedCount, runs: s.list().items[0].runs,
    nestedReceipts: nested.length, nestedDeferred: nested.filter((x) => x.deferred === true).length,
  }
}

console.log('=== 1. THE PARADIGM REFUSES TO CALL ITSELF SUCCESSFUL (self-proofs) ===')
{
  // ① a renamed anchor is MUTATION-NOT-APPLIED, never "the probe cannot fail"
  let e1 = null
  try { mutateOnce('const a = 1\n', { find: 'const b = 2' }) } catch (e) { e1 = e }
  ok(!!e1 && e1.code === FALSIFY_PROBLEM.notApplied, '① a missing anchor is refused by name', e1 && e1.code)
  let e2 = null
  try { mutateOnce('x x\n', { find: 'x' }) } catch (e) { e2 = e }
  ok(!!e2 && e2.code === FALSIFY_PROBLEM.notApplied && /2 time/.test(e2.message), '① an ambiguous anchor (2 occurrences, 1 declared) is refused too', e2 && e2.message)
  // ⑤ a temp root that is not `_tmp` is refused, so a mutant can never be written into the repository
  let e3 = null
  try { assertSafeTempRoot(join(REPO, 'vibe-math-vmu')) } catch (e) { e3 = e }
  ok(!!e3 && e3.code === FALSIFY_PROBLEM.unsafeTmp, '⑤ a temp root inside the repository is refused (the copy can never land in-repo)', e3 && e3.code)
  ok(assertSafeTempRoot(DEFAULT_TMP_DIR) === DEFAULT_TMP_DIR, '⑤ the declared temp root is accepted')
  // self-containment: a relative import is rewritten to an absolute URL, a bare specifier is left alone
  const rewritten = selfContainedSource("import { a } from './x.js'\nimport b from 'node:fs'\nexport { c } from '../y/z.js'\n", ACTIVITY)
  ok(/from 'file:\/\/\/.*kernel\/x\.js'/.test(rewritten) && /from 'node:fs'/.test(rewritten) && /z\.js'/.test(rewritten),
    'a copied module becomes self-contained (relative specifiers → file:// URLs; package specifiers untouched)')
  // ② a mutant that cannot even be imported is a PROBLEM, not a "red probe"
  const broken = await falsify({
    name: 'self-proof: unimportable mutant',
    module: SCHEDULER,
    mutations: [{ label: 'syntax error', find: 'export const apiVersion = 1', replace: 'export const apiVersion = = 1' }],
    probe: trampolineReading,
  })
  ok(broken.ok === false && broken.problems.some((p) => p.startsWith(FALSIFY_PROBLEM.unimportable)),
    '② a mutant that does not import is reported as MUTANT-UNIMPORTABLE (never mistaken for a red probe)', broken.problems)
  // ④ a mutation that changes nothing the probe reads is PROBE-DOES-NOT-DISCRIMINATE
  const noop = await falsify({
    name: 'self-proof: no-op mutation',
    module: SCHEDULER,
    mutations: [{ label: 'irrelevant constant', find: 'const DEFAULT_LIST_CAP = 200', replace: 'const DEFAULT_LIST_CAP = 201' }],
    probe: trampolineReading,
  })
  ok(noop.ok === false && noop.problems.some((p) => p.startsWith(FALSIFY_PROBLEM.noDiscrimination)),
    '④ a mutation the probe cannot see is reported as PROBE-DOES-NOT-DISCRIMINATE (a no-op is not a falsification)', noop.problems)
  ok(noop.leftovers.length === 0 && broken.leftovers.length === 0, '⑤ and both self-proofs cleaned their copies up', { noop: noop.leftovers, broken: broken.leftovers })
}

console.log('=== 2. THE ROUND-3 RESULT, REPRODUCED THROUGH THE LIBRARY ===')
{
  const report = await falsify({
    name: 'kernel/activity.js — future-only is load-bearing',
    module: ACTIVITY,
    mutations: [{
      label: 'history replayed as news',
      name: 'activity-history',
      find: 'waiters.add(entry)',
      replace: 'waiters.add(entry)\n        if (lastNotification) { settle(() => resolve({ ok: true, timedOut: false, historical: true, notified: { what: lastNotification.what, seq: lastNotification.seq, at: lastNotification.at }, timeoutMs: ms, clamped, member: memberId || null, reason: why, peerCheck })); return }',
    }],
    probe: futureOnlyReading,
  })
  ok(report.ok, '★ the same probe is GREEN on the real module and RED on the historical-replay mutant', formatReport(report))
  ok(JSON.stringify(report.real) === JSON.stringify({ wokeOnHistory: false, timedOut: true }),
    'and the green baseline is the exact round-3 reading (no history wake, ends on its own timeout)', report.real)
  ok(report.results[0] && report.results[0].red && report.results[0].red.wokeOnHistory === true,
    'and the mutant reddens for the RIGHT reason (the newcomer was woken by history)', report.results[0] && report.results[0].red)
}

console.log('=== 3. THE ROUND-4 FIXES ARE LOAD-BEARING (F15 release, F16 trampoline) ===')
{
  const report = await falsify({
    name: 'kernel/scheduler.js — the F15/F16 guards',
    module: SCHEDULER,
    mutations: [
      { label: 'F15: the fired handle is no longer released', name: 'sched-release',
        find: '            const cleared = timerClear(handle)\n            handles.delete(it.id)\n            firedByTimer += 1\n',
        replace: '            const cleared = timerClear(handle)\n            firedByTimer += 1\n' },
      { label: 'F16a: the trampoline guard is removed', name: 'sched-guard',
        find: 'if (ticking) {', replace: 'if (false) {' },
      { label: 'F16b: the deferred re-run is never requested', name: 'sched-rerun',
        find: '        rerunRequested = true\n        reentrantDeferred += 1', replace: '        rerunRequested = false\n        reentrantDeferred += 1' },
    ],
    probe: async (mod) => {
      const [fired, trampoline] = [await firedHandleReading(mod), await trampolineReading(mod)]
      return { fired, trampoline }
    },
  })
  ok(report.ok, '★ all three mutations are caught by the same probe pair', formatReport(report))
  ok(report.real.fired.handlesAfterFire === 0 && report.real.fired.rearmed === 1 && report.real.fired.timerFired === 1,
    'F15 green: the fired handle is released, counted, and the recurring item can be re-armed', report.real.fired)
  ok(report.real.trampoline.passes === 2 && report.real.trampoline.deferred === 1 && report.real.trampoline.fired === 1 && report.real.trampoline.runs === 1,
    'F16 green: the re-entrant tick is deferred into ONE extra pass, and the item fires exactly once', report.real.trampoline)
  const byLabel = (needle) => report.results.find((r) => r.label.includes(needle))
  ok(!!byLabel('F15') && byLabel('F15').red && byLabel('F15').red.fired.handlesAfterFire === 1 && byLabel('F15').red.fired.rearmed === 0,
    'F15 red: without the release the handle stays counted AND the recurring item can never be re-armed', byLabel('F15') && byLabel('F15').red)
  ok(!!byLabel('F16a') && byLabel('F16a').red && byLabel('F16a').red.trampoline.nestedDeferred === 0,
    'F16a red: without the guard the nested call is not deferred (it recursed until the probe caught the failure)', byLabel('F16a') && byLabel('F16a').red)
  ok(!!byLabel('F16b') && byLabel('F16b').red && byLabel('F16b').red.trampoline.passes === 1,
    'F16b red: without the rerun request the missed trigger is NOT picked up by a next pass (one pass only)', byLabel('F16b') && byLabel('F16b').red)
}

console.log('=== 4. THE MINIMAL 10-LINE FORM IS REAL (and stays in sync with the API) ===')
{
  const lines = MINIMAL_FAMILY_EXAMPLE.split('\n')
  ok(lines.length === 10, '★ the exported recipe is exactly TEN lines (the claim is not rounded up)', lines.length)
  ok(/falsifyFamily\(/.test(MINIMAL_FAMILY_EXAMPLE) && /formatFamilyReport\(/.test(MINIMAL_FAMILY_EXAMPLE),
    'and it uses the family entry point + its renderer', MINIMAL_FAMILY_EXAMPLE.split('\n').filter((l) => /falsifyFamily|formatFamilyReport/.test(l)).length)
  // Every lib symbol the recipe names must really be exported (a recipe that drifts from the API is worse than none).
  const named = [...MINIMAL_FAMILY_EXAMPLE.matchAll(/\b(falsifyFamily|formatFamilyReport|falsify|mutateOnce)\b/g)].map((m) => m[1])
  const api = { falsifyFamily, formatFamilyReport, falsify, mutateOnce }
  ok(named.length >= 2 && named.every((n) => typeof api[n] === 'function'),
    'every library symbol the recipe names is exported by this file (non-vacuous: the recipe really names some)', named)
  ok(/probe/.test(MINIMAL_FAMILY_EXAMPLE) && /mutations/.test(MINIMAL_FAMILY_EXAMPLE) && /CONTROL/.test(MINIMAL_FAMILY_EXAMPLE),
    'and it states the two things a family cannot omit: a probe and at least one mutation (with the CONTROL reminder)', MINIMAL_FAMILY_EXAMPLE.length)
  // The family form is also a FUNCTION: an empty case list is refused rather than silently "ok".
  let refused = null
  try { await falsifyFamily({ name: 'empty', cases: [] }) } catch (e) { refused = (e && e.code) || String((e && e.message) || e) }
  ok(refused === FALSIFY_PROBLEM.notApplied, 'and falsifyFamily refuses an empty case list by name (never a vacuous "ok")', refused)
}

console.log('=== 5. ELIGIBILITY AND THE CONTROL DIRECTION ARE CHECKED, NOT ASSUMED ===')
{
  const elig = familyEligibility({ module: TASKS })
  ok(elig.ok === true && elig.factory === 'createTasks' && elig.decisionPoints > 0 && elig.refusalCodes.includes('VMU_TASK_DEPENDENCY_CYCLE'),
    'a real face is ELIGIBLE: an exported factory, removable decision points, and named refusal codes', elig)
  const notElig = familyEligibility({ module: STRIP })
  ok(notElig.ok === false && notElig.reasons.length > 0,
    '★ a module with no decision point and no factory is NOT eligible — the check refuses padding the family count', notElig)
  ok(/no removable decision point|no exported create/.test(notElig.reasons.join(' | ')),
    'and it says WHY, so the answer is actionable rather than a verdict', notElig.reasons)
  const noControl = await falsify({
    name: 'control guard', module: SCHEDULER, controlFields: ['thisFieldDoesNotExist'],
    mutations: [{ label: 'guard removed', find: 'if (ticking) {', replace: 'if (false) {' }], probe: trampolineReading,
  })
  ok(noControl.ok === false && noControl.problems.some((p) => p.startsWith(FALSIFY_PROBLEM.controlAbsent)),
    '★ a probe whose green reading has no control field is refused by name (CONTROL-FIELD-ABSENT)', noControl.problems)
  const withControl = await falsify({
    name: 'control present', module: SCHEDULER, controlFields: ['passes', 'fired'],
    mutations: [{ label: 'guard removed', find: 'if (ticking) {', replace: 'if (false) {' }], probe: trampolineReading,
  })
  ok(withControl.ok === true, 'and the same probe WITH its real control fields passes (the guard is not always-red)', withControl.problems)
}

console.log('')
console.log('=== VMU FALSIFY LIB: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
