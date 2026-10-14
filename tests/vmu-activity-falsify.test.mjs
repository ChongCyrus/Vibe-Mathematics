// tests/vmu-activity-falsify.test.mjs — FAMILY 8: `kernel/activity.js`, in TWO cases.
// Run: node tests/vmu-activity-falsify.test.mjs
//
// ROUND 8: this file used to carry its own hand-rolled mutation plumbing (copy → splice → import → probe, plus an
// in-file mutant). The family form now does that through `tests/_lib/falsify.mjs`, so the file states only the
// INVARIANT and the DEFECTS. The in-file/laboratory self-proofs live in `tests/vmu-activity-falsify-lib.test.mjs`.
//
// CASE 1 — the FUTURE-ONLY one-shot waiter (one probe, three invariants, each with a control direction):
//   · FUTURE-ONLY — a notification from BEFORE the wait never wakes it; the wait ends on its own timeout;
//   · ONE-SHOT    — after the wake the waiter is unregistered, so a second notification wakes NOBODY (0, not 1);
//   · DISPOSER    — the wake branch ran the timer disposer exactly once (the "disposer in both outcomes" rule).
//
// CASE 2 — the ROUND-9 surface, i.e. the promises `docs/08 §26` makes about this face, each one an implementation
// line that can be cut. The DOCUMENT IS READ BY THE PROBE: every rule below is a control field extracted from the
// volume, so a citation that rots (or is quietly softened) takes the family down with it — the promise is only
// checked while it is still written down.
//   · `docs/08:1563` — the wake listener RETURNS `undefined`, so a broken observer can never block the write it
//     observes (`bus.emit(...).decisions` must be empty);
//   · `docs/08:1557` — a peer seam that throws or answers with a non-list is a NAMED refusal
//     (`VMU_ACTIVITY_PEER_SEAM_FAILED`), never read as "nobody is running";
//   · `docs/08:1543/1572` — `vmu.activity.maxWaiters` is a real cap (`VMU_ACTIVITY_WAITER_LIMIT`);
//   · `docs/08:1575` — the two self-disclosure rules: (①) `vmu.activity.wakeOn` is a CONSTRUCTION-time key and must
//     never appear in a call receipt's `enforced[]`; (②) `vmu.activity.timeoutMs` is named ONLY when the caller
//     omitted the timeout (and a seam-bearing call necessarily names `vmu.activity.noPeerShortCircuit`).
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ACTIVITY = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'activity.js')
const DOC08 = join(HERE, '..', 'vibe-math-vmu', 'docs', '08-primitives-meeting-ballot-workflow.md')

// The REAL bus, so "the observer contributes no decision" is read from an actual `emit`, not from a stub's opinion.
const { createBus } = await import(pathToFileURL(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'bus.js')).href)
// The volume is read once: the probe extracts the five rules from it and reports each as a control field.
const DOC = readFileSync(DOC08, 'utf8')
const docRule = (re) => re.test(DOC)

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

/** A manual timer: nothing ever fires by itself, so an unenforced cap shows up as "still pending", never as a hang. */
function manualTimer() {
  const timers = new Map()
  let seq = 0
  return {
    timeout(cb) { const id = ++seq; timers.set(id, cb); return () => timers.delete(id) },
    size: () => timers.size,
  }
}
/** The NAMED outcome of a synchronous call: its `code`, else its error name — an unnamed throw is a finding too. */
function codeOf(fn) {
  try { const r = fn(); return r && r.code ? r.code : 'NO-THROW' } catch (e) { return (e && e.code) || (e && e.name) || 'THREW' }
}

async function activityPromisesProbe(mod) {
  // (a) THE WAKE LISTENER OBSERVES: a declared hook, a live waiter, a real `emit` — the emit must carry NO decision.
  const bus = createBus({ entries: [], settings: { 'vmu.middleware.hookTimeoutMs': 0 }, clock: () => 0 })
  const a1 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), bus,
    settings: { 'vmu.activity.wakeOn': ['chat/sent'] } })
  const woken = a1.wait({ timeoutMs: 20000, member: 'm1' })
  const emitted = await bus.emit('chat/sent', { by: 'm2' })
  const got = await woken
  const wakeSilent = emitted.ok === true && Array.isArray(emitted.decisions) && emitted.decisions.length === 0
  const wakeStillWoke = got.timedOut === false && got.notified && got.notified.what === 'hook:chat/sent'
  // (b) A PEER SEAM THAT ANSWERS WITH A NON-LIST is a NAMED refusal, never "nobody is running".
  const a2 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: {}, activePeers: () => null })
  const peerSeamCode = codeOf(() => a2.wait({ timeoutMs: 20000 }))
  const peerSeamPending = a2.status().waiters
  // (c) THE WAITER CAP IS REAL: with maxWaiters=1 the second wait is refused BY NAME, the first one stays live.
  const a3 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: { 'vmu.activity.maxWaiters': 1 } })
  a3.wait({ timeoutMs: 20000 })
  const limitCode = codeOf(() => a3.wait({ timeoutMs: 20000 }))
  const waitersAtLimit = a3.status().waiters
  // (d) THE TWO DISCLOSURE RULES: a seam-bearing call must name the peer key (and never the construction-time key).
  const seamSettings = { 'vmu.activity.wakeOn': ['chat/sent'] }
  const a4 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: seamSettings,
    activePeers: () => ['m2'] })
  const p4 = a4.wait({ timeoutMs: 20000, member: 'm1' })
  a4.notify({ what: 'n' })
  const r4 = await p4
  const enforced4 = Array.isArray(r4.enforced) ? r4.enforced : []
  // (e) the omitted-vs-explicit timeout: the default key is named ONLY when the caller omitted the timeout.
  const a5 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: {} })
  const p5 = a5.wait({ timeoutMs: 20000 })          // EXPLICIT ⇒ the default key was never read
  a5.notify({ what: 'x' })
  const explicitKeys = (await p5).enforced || []
  const a6 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: {} })
  const p6 = a6.wait({})                            // OMITTED ⇒ the declared default really was read
  a6.notify({ what: 'y' })
  const omittedKeys = (await p6).enforced || []
  return {
    // the four citations this case is built on (a rotted citation removes a control field ⇒ the family goes red)
    docRuleWakeSilent: docRule(/返回 `undefined`\*\*（不产生任何 decision）/),
    docRulePeerSeamNamed: docRule(/VMU_ACTIVITY_PEER_SEAM_FAILED/),
    docRuleWakeOnConstruction: docRule(/wakeOn` 是\*\*构造期\*\*键/),
    docRuleTimeoutOmittedOnly: docRule(/timeoutMs` 只在\*\*调用方省略超时\*\*时进入/),
    wakeSilent, wakeStillWoke,
    peerSeamCode, peerSeamPending,
    limitCode, waitersAtLimit,
    seamKeyNamed: enforced4.includes('vmu.activity.noPeerShortCircuit'),
    constructionKeyLeaked: enforced4.includes('vmu.activity.wakeOn'),
    omittedNamesDefaultKey: omittedKeys.includes('vmu.activity.timeoutMs'),
    explicitClaimsDefaultKey: explicitKeys.includes('vmu.activity.timeoutMs'),
  }
}

/**
 * The face's GOVERNANCE surface: the three things `docs/08 §26` promises about *not lying* — the clamp (a declared
 * policy that must name the value it really armed), the dispose (a pending wait ends NAMED, never dropped) and the
 * notification ring (bounded WITH the drops counted). Each part is read from the face's own counters, and the timer
 * seam records the milliseconds that were really armed, so "claims clamped, arms the raw value" is visible.
 */
async function activityGovernanceProbe(mod) {
  // (a) CLAMP: 5 ms against declared bounds [10000, 20000] ⇒ the armed timeout must be the bound, and the receipt
  //     must self-disclose `clamped:true`. The timer is a hand-fired one: the clamped wait is never awaited before
  //     the value it armed is known (and a policy that REFUSES instead of clamping throws synchronously).
  const armedA = []
  let fireA = null
  const timerA = { timeout(cb, ms) { armedA.push(ms); fireA = cb; return () => {} } }
  const a1 = mod.createActivity({ clock: () => 0, log: () => {}, timer: timerA,
    settings: { 'vmu.activity.timeoutPolicy': 'clamp', 'vmu.activity.timeoutMinMs': 10000, 'vmu.activity.timeoutMaxMs': 20000 } })
  let clampCode = null, clampReceipt = null, clampWait = null
  try { clampWait = a1.wait({ timeoutMs: 5 }) } catch (e) { clampCode = (e && e.code) || (e && e.name) || 'THREW' }
  if (clampWait) { if (typeof fireA === 'function') fireA(); clampReceipt = await clampWait }
  // (b) DISPOSE: a pending wait must end with the NAMED code (a wait that ends because its owner left is not a
  //     satisfied wait), the disposer must run, and the set must be empty.
  const a2 = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: {} })
  let disposeOutcome = 'pending'
  const p2 = a2.wait({ timeoutMs: 20000, member: 'm1' })
    .then(() => { disposeOutcome = 'resolved' }, (e) => { disposeOutcome = (e && e.code) || 'unnamed' })
  const disposed = a2.dispose({ reason: 'owner-left' })
  await tick()
  const disposeStatus = a2.status()
  // (c) THE RING: past its bound the face must RETIRE old notifications and COUNT every retirement. The bound itself
  //     is NOT exposed by `status()` (the view is always the newest five), so the reading is deliberately BOUND-FREE:
  //     two different totals are sent, and the drop counter must advance one-for-one with the notifications past the
  //     bound. That is what "bounded, and the drops are counted" means observably — a hardcoded N would be a
  //     re-statement of the implementation rather than a check of it.
  const send = (n) => {
    const a = mod.createActivity({ clock: () => 0, log: () => {}, timer: manualTimer(), settings: {} })
    for (let i = 0; i < n; i += 1) a.notify({ what: 'n' + i })
    return a.status()
  }
  const s60 = send(60)
  const s80 = send(80)
  const tail = Array.isArray(s60.notificationRing) ? s60.notificationRing : []
  return {
    clampClamped: !!(clampReceipt && clampReceipt.clamped === true),
    clampMs: clampReceipt ? clampReceipt.timeoutMs : -1,
    armedMs: armedA.length ? armedA[0] : -1,
    clampCode,
    clampCounted: a1.status().clamped,
    disposeOutcome, disposeClosed: disposed.closedWaiters,
    disposersAfterDispose: disposeStatus.disposersCalled, waitersAfterDispose: disposeStatus.waiters,
    secondDisposeAlready: a2.dispose({ reason: 'again' }).alreadyDisposed === true,
    ringSent: 60, ringViewSize: tail.length, ringDroppedAt60: s60.ringDropped,
    ringTailNewest: tail.length > 0 && tail[tail.length - 1].what === 'n59',
    ringDropsStarted: s60.ringDropped > 0,
    ringDropsAdvance: (s80.ringDropped - s60.ringDropped) === 20,
    ringViewBounded: tail.length <= 5,
  }
}

const family = await falsifyFamily({
  name: 'activity — future-only one-shot, the documented surface, and the governance counters',
  cases: [{
    name: 'activity.js — the waiter',
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
  }, {
    name: 'activity.js — the documented surface',
    module: ACTIVITY,
    probe: activityPromisesProbe,
    controlFields: ['docRuleWakeSilent', 'docRulePeerSeamNamed', 'docRuleWakeOnConstruction', 'docRuleTimeoutOmittedOnly',
      'wakeSilent', 'peerSeamCode', 'limitCode', 'seamKeyNamed', 'omittedNamesDefaultKey'],
    mutations: [
      { label: 'the wake listener blocks the write it observes', name: 'activity-wake-blocks',
        find: "source: 'bus' }); return undefined }",
        replace: "source: 'bus' }); return { deny: { code: 'VMU_ACTIVITY_MUTANT_WAKE', message: 'the wake listener blocked the write it observes' } } }" },
      { label: 'a peer seam answer that is not a list is read as "nobody"', name: 'activity-peer-seam-unnamed',
        find: '          if (!Array.isArray(peers)) {',
        replace: '          if (false) {   // MUTANT: a missing peer answer is no longer refused by name' },
      { label: 'the waiter cap is declared but not enforced', name: 'activity-cap-unenforced',
        find: '      if (p.maxWaiters > 0 && waiters.size >= p.maxWaiters) {',
        replace: '      if (false) {   // MUTANT: the declared cap does not bound anything' },
      { label: 'the construction-time key is disclosed as a call-time one', name: 'activity-wakeon-leak',
        find: "        keys.push('vmu.activity.noPeerShortCircuit')",
        replace: "        keys.push('vmu.activity.wakeOn')   // MUTANT: a construction-time key inside a call receipt" },
      { label: 'an explicit timeout claims to have read the default', name: 'activity-timeout-overclaim',
        find: '} else { ms = Number(timeoutMs) }',
        replace: '} else { ms = Number(timeoutMs); keys.push(\'vmu.activity.timeoutMs\') }' },
    ],
  }, {
    name: 'activity.js — the governance counters',
    module: ACTIVITY,
    probe: activityGovernanceProbe,
    controlFields: ['clampClamped', 'disposeOutcome', 'disposeClosed', 'disposersAfterDispose', 'secondDisposeAlready',
      'ringDropsStarted', 'ringDropsAdvance', 'ringTailNewest'],
    mutations: [
      // NOTE: the mid-line MUTANT markers are deliberately absent here. A `//` inside a one-line statement would
      // comment out the rest of that statement (braces included) and the library would report the unhelpful
      // `MUTANT-UNIMPORTABLE` instead of a reading. The label is the documentation; the replacement stays surgical.
      { label: 'the declared clamp policy refuses instead of clamping', name: 'activity-clamp-refuses',
        find: "        if (p.timeoutPolicy === 'clamp') { ms = Math.min(Math.max(ms, p.timeoutMinMs), p.timeoutMaxMs); clamped = true; clampedCount += 1 }",
        replace: "        if (false && p.timeoutPolicy === 'clamp') { ms = Math.min(Math.max(ms, p.timeoutMinMs), p.timeoutMaxMs); clamped = true; clampedCount += 1 }   // MUTANT: the declared policy is ignored" },
      { label: 'the clamp claims to have applied but arms the raw value', name: 'activity-clamp-wrong-direction',
        find: 'ms = Math.min(Math.max(ms, p.timeoutMinMs), p.timeoutMaxMs)',
        replace: 'ms = Math.max(Math.min(ms, p.timeoutMaxMs), 0)' },
      { label: 'dispose claims to close the waiter and leaves it hanging', name: 'activity-dispose-drops',
        find: "if (typeof w.fail === 'function') w.fail(refuse(CODE.disposed,",
        replace: 'if (false) w.fail(refuse(CODE.disposed,' },
      { label: 'the notification ring is bounded but the drops are not counted', name: 'activity-ring-uncounted',
        find: 'notes.splice(0, over); ringDropped += over',
        replace: 'notes.splice(0, over)' },
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

console.log('=== CONTROL GROUP: the documented surface (docs/08 §26) is really wired, and the citations are still there ===')
const d = family.cases[1].real
ok(d.docRuleWakeSilent === true && d.docRulePeerSeamNamed === true && d.docRuleWakeOnConstruction === true && d.docRuleTimeoutOmittedOnly === true,
  '★ the volume still states all four rules this case is built on (a rotted citation removes a control field)', d)
ok(d.wakeSilent === true && d.wakeStillWoke === true,
  '★ a real `bus.emit` on the declared hook carries ZERO decisions — and still wakes the waiter end to end', d)
ok(d.peerSeamCode === 'VMU_ACTIVITY_PEER_SEAM_FAILED' && d.peerSeamPending === 0,
  '★ a peer seam answering with a non-list is refused BY NAME and registers no waiter (never read as "nobody")', d)
ok(d.limitCode === 'VMU_ACTIVITY_WAITER_LIMIT' && d.waitersAtLimit === 1,
  '★ `vmu.activity.maxWaiters` really caps the live set, and the refusal is NAMED', d)
ok(d.seamKeyNamed === true && d.constructionKeyLeaked === false,
  '★ a seam-bearing receipt names `vmu.activity.noPeerShortCircuit` — and NOT the construction-time `wakeOn`', d)
ok(d.omittedNamesDefaultKey === true && d.explicitClaimsDefaultKey === false,
  'and `vmu.activity.timeoutMs` is named only when the caller omitted the timeout (both directions present)', d)

console.log('=== CONTROL GROUP: the governance counters tell the truth about what they did ===')
const g = family.cases[2].real
ok(g.clampClamped === true && g.clampMs === 10000 && g.armedMs === 10000 && g.clampCounted === 1,
  '★ the declared `clamp` policy really clamps: the receipt AND the armed timer both carry the lower bound, and the clamp is counted', g)
ok(g.disposeOutcome === 'VMU_ACTIVITY_DISPOSED' && g.disposeClosed === 1 && g.waitersAfterDispose === 0 && g.disposersAfterDispose === 1,
  '★ a pending wait ends NAMED on dispose, the disposer runs, and the live set is empty (a dropped waiter would leave a hanging promise)', g)
ok(g.secondDisposeAlready === true, 'and a second dispose is idempotent (`alreadyDisposed`) rather than closing anything twice', g)
ok(g.ringDropsStarted === true && g.ringDropsAdvance === true && g.ringTailNewest === true && g.ringViewBounded === true,
  '★ the ring retires old notifications one-for-one and COUNTS every retirement (bound-free reading: 80 sent drops exactly 20 more than 60), and the visible tail is the newest', g)

console.log('=== FALSIFICATION: replay history, keep the waiter, drop the disposer, cut a documented promise, lie in a counter ===')
ok(family.ok, '★ all twelve activity mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const historyRed = byLabel('history is replayed') && byLabel('history is replayed').red
const reuseRed = byLabel('never unregistered') && byLabel('never unregistered').red
const disposerRed = byLabel('disposer is disabled') && byLabel('disposer is disabled').red
ok(!!historyRed && historyRed.wokeOnHistory === true, '★ "history replayed": the newcomer is woken by an activity that already happened', historyRed)
ok(!!reuseRed && reuseRed.lateNotified === 1 && reuseRed.secondNotified === 0,
  '★ "never unregistered": a spent (timed-out) waiter is still counted as woken by the next notification — while the WOKEN path is unaffected (the mutation is narrow)', reuseRed)
ok(!!disposerRed && disposerRed.disposersCalled === 0, '★ "disposer disabled": the wake branch leaves the timer uncleaned', disposerRed)
const blocksRed = byLabel('wake listener blocks') && byLabel('wake listener blocks').red
const unnamedRed = byLabel('not a list is read') && byLabel('not a list is read').red
const capRed = byLabel('cap is declared but not enforced') && byLabel('cap is declared but not enforced').red
const leakRed = byLabel('construction-time key is disclosed') && byLabel('construction-time key is disclosed').red
const overclaimRed = byLabel('explicit timeout claims') && byLabel('explicit timeout claims').red
ok(!!blocksRed && blocksRed.wakeSilent === false && blocksRed.docRuleWakeSilent === true,
  '★ "the observer blocks": the write that should be observed now carries a decision (and the citation is still intact, so the doc promise is what broke)', blocksRed)
ok(!!unnamedRed && unnamedRed.peerSeamCode !== 'VMU_ACTIVITY_PEER_SEAM_FAILED',
  '★ "unnamed seam failure": an unanswerable peer check becomes an UNNAMED throw instead of the named refusal', unnamedRed)
ok(!!capRed && capRed.limitCode === 'NO-THROW' && capRed.waitersAtLimit === 2,
  '★ "cap not enforced": a second waiter is admitted while `maxWaiters` says one (and both stay pending, not hanging)', capRed)
ok(!!leakRed && leakRed.seamKeyNamed === false && leakRed.constructionKeyLeaked === true,
  '★ "wakeOn leaked": a construction-time key appears in a call receipt — the exact thing docs/08:1575 forbids', leakRed)
ok(!!overclaimRed && overclaimRed.explicitClaimsDefaultKey === true && overclaimRed.omittedNamesDefaultKey === true,
  '★ "over-claim": an explicit timeout is now reported as having evaluated the declared default', overclaimRed)
const clampRefuseRed = byLabel('clamp policy refuses') && byLabel('clamp policy refuses').red
const clampWrongRed = byLabel('clamp claims to have applied') && byLabel('clamp claims to have applied').red
const disposeRed = byLabel('dispose claims to close') && byLabel('dispose claims to close').red
const ringUncountedRed = byLabel('drops are not counted') && byLabel('drops are not counted').red
ok(!!clampRefuseRed && clampRefuseRed.clampCode === 'VMU_ACTIVITY_INVALID_TIMEOUT' && clampRefuseRed.armedMs === -1 && clampRefuseRed.clampClamped === false,
  '★ "clamp ignored": a value the declared policy says to clamp is now REFUSED instead, and nothing is armed', clampRefuseRed)
ok(!!clampWrongRed && clampWrongRed.clampClamped === true && clampWrongRed.clampMs === 5 && clampWrongRed.armedMs === 5,
  '★ "clamp in the wrong direction": the receipt claims `clamped:true` while the timer is armed with the RAW value — below the declared lower bound (a lie about the value, not about the flag)', clampWrongRed)
ok(!!disposeRed && disposeRed.disposeOutcome === 'pending' && disposeRed.disposeClosed === 1 && disposeRed.disposersAfterDispose === 0,
  '★ "dispose drops the waiter": the receipt claims it closed 1 waiter while the promise NEVER settles and the disposer never runs', disposeRed)
ok(!!ringUncountedRed && ringUncountedRed.ringDropsStarted === false && ringUncountedRed.ringDropsAdvance === false && ringUncountedRed.ringTailNewest === true,
  '★ "the drop is silent": the tail still rotates (the ring works) but the counter never moves — the entries thrown away are recounted nowhere', ringUncountedRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases.length > 0 && family.cases.every((c) => c.leftovers.length === 0),
  'the mutated copies were written to D:\\_tmp and deleted again', family.cases.map((c) => c.leftovers))

console.log('')
console.log('=== VMU ACTIVITY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
