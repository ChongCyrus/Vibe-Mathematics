// tests/vmu-activity-kernel.test.mjs — the one-shot, FUTURE-ONLY activity waiter, independently runnable.
// Run: node tests/vmu-activity-kernel.test.mjs     Last line: === VMU ACTIVITY: N passed, M failed ===
//
// The three assertions this face exists for are in sections 1, 4 and 5, and each of them is written so that a wrong
// implementation fails it (section 1 is falsified from the OUTSIDE in `tests/vmu-activity-falsify.test.mjs`, which
// mutates `kernel/activity.js` itself):
//   · future-only   — a notification from BEFORE the wait can never wake it (no backlog, no replay);
//   · one-shot      — one notification wakes the current generation exactly once, then the waiter is gone;
//   · disposer      — the timeout disposer runs on SUCCESS, TIMEOUT and ABORT, and nowhere twice.
import { createActivity, CODE, TIMEOUT_BOUNDS, ACTIVITY_KEYS, WIRED_ACTIVITY_KEYS, WAKE_ENTRY_ID, normalizeTimer, normalizeWakeOn } from '../vibe-math-vmu/kernel/activity.js'
import { createBus } from '../vibe-math-vmu/kernel/bus.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
/** A synchronous refusal: returns the error so its code/hint/enforced can be inspected. */
function refusalOf(fn, code) {
  try { fn(); failed++; failures.push('expected a refusal, got a value'); console.error('  FAIL expected ' + code + ', no refusal'); return null }
  catch (e) {
    if (e && e.code === code) { passed++; return e }
    failed++; failures.push('refusal code ' + (e && e.code) + ' != ' + code)
    console.error('  FAIL refusal code ' + (e && e.code) + ' != ' + code + ' (' + (e && e.message) + ')')
    return null
  }
}
async function rejectionOf(promise, code) {
  try { await promise; failed++; failures.push('expected rejection ' + code + ', resolved'); console.error('  FAIL expected rejection ' + code); return null }
  catch (e) {
    if (e && e.code === code) { passed++; return e }
    failed++; failures.push('rejection code ' + (e && e.code) + ' != ' + code)
    console.error('  FAIL rejection code ' + (e && e.code) + ' != ' + code + ' (' + (e && e.message) + ')')
    return null
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const json = (v) => JSON.stringify(v)

/**
 * The deterministic harness: a fake clock and a fake timer whose disposer calls are COUNTED, so "the disposer ran on
 * every branch" is a reading rather than a promise. No real timer is ever armed here.
 */
function harness({ settings = {}, bus = null, timer, activePeers = null, clockStart = 0 } = {}) {
  let t = clockStart
  const timers = new Map()
  const disposerCalls = []
  let seq = 0
  const armed = []
  const fake = { timeout(cb, ms) { const id = ++seq; timers.set(id, { cb, ms }); armed.push({ id, ms }); return () => { disposerCalls.push(id); timers.delete(id) } } }
  const activity = createActivity(Object.assign({ clock: () => t, log: () => {}, settings, bus, activePeers },
    timer === undefined ? { timer: fake } : { timer }))
  return {
    activity, disposerCalls, armed,
    advance: (ms) => { t += ms },
    at: () => t,
    fireNext: () => { const e = [...timers.entries()][0]; if (!e) return false; timers.delete(e[0]); e[1].cb(); return true },
    pending: () => timers.size,
    armedMs: () => armed.map((a) => a.ms),
  }
}
const codeCount = (status, code) => (status.refusals && status.refusals[code]) || 0

console.log('=== 1. FUTURE-ONLY: history is not activity ===')
{
  const h = harness()
  // A committed change happens BEFORE anybody waits. It must be recorded and wake NOBODY.
  const rec = h.activity.notify({ what: 'before-the-wait', at: 111 })
  ok(rec.notified === 0 && rec.seq === 1, 'notifying with no waiter wakes nobody (and still counts as one notification)', rec)
  ok(h.activity.status().lastNotification.what === 'before-the-wait', 'and the fact is still recorded for an observer', h.activity.status().lastNotification)
  ok(h.activity.status().waiters === 0, 'no waiter was queued: there is no backlog to replay')

  let settled = null
  const p = h.activity.wait({ timeoutMs: 10000 }).then((r) => { settled = r; return r })
  await tick()
  ok(settled === null, '★ a notification from BEFORE the wait does NOT wake it (historical activity is not new activity)')
  ok(h.pending() === 1, 'the waiter is armed and really waiting', h.pending())
  ok(h.activity.status().waiters === 1, 'and the status shows exactly one live waiter')
  h.advance(10000)
  h.fireNext()
  const r = await p
  ok(r.timedOut === true && r.notified === undefined, 'so it ends on its OWN timeout, not on the historical notification', r)
  ok(h.disposerCalls.length === 1, 'the timeout branch ran the disposer exactly once', h.disposerCalls)
  ok(h.pending() === 0 && h.activity.status().waiters === 0, 'and nothing is left armed or registered')

  // The other direction (so the assertion is not vacuous): the SAME waiter IS woken by a notification after it starts.
  const h2 = harness()
  h2.activity.notify({ what: 'history' })
  const p2 = h2.activity.wait({ timeoutMs: 10000 })
  h2.activity.notify({ what: 'news', at: 222 })
  const r2 = await p2
  ok(r2.timedOut === false && r2.notified.what === 'news' && r2.notified.seq === 2,
    'and a notification that arrives AFTER the wait DOES wake it (the probe discriminates, it is not always-red)', r2)
  ok(h2.disposerCalls.length === 1, 'the success branch ran the disposer exactly once', h2.disposerCalls)
}

console.log('=== 2. ONE-SHOT: one notification, one generation ===')
{
  const h = harness()
  const p1 = h.activity.wait({ timeoutMs: 10000 })
  const p2 = h.activity.wait({ timeoutMs: 10000 })
  const rec = h.activity.notify({ what: 'state-change' })
  ok(rec.notified === 2 && rec.waiters === 0, 'one notification wakes the CURRENT generation and clears it', rec)
  const [r1, r2] = await Promise.all([p1, p2])
  ok(r1.timedOut === false && r2.timedOut === false, 'both waiters resolved as woken, not timed out')
  ok(r1.notified.seq === 1 && r2.notified.seq === 1, 'both carry the SAME notification identity', [r1.notified, r2.notified])
  const second = h.activity.notify({ what: 'again' })
  ok(second.notified === 0, '★ a second notification wakes nobody: the waiters were unregistered when they were woken', second)
  await tick()
  ok(h.activity.status().woken === 2, 'the status counts exactly two wakes, not four', h.activity.status().woken)
  ok(h.disposerCalls.length === 2 && h.pending() === 0, 'each waiter ran its disposer exactly once', [h.disposerCalls, h.pending()])
  ok(h.activity.status().timedOut === 0 && h.activity.status().waiters === 0, 'no waiter timed out and none is left')
}

console.log('=== 3. MULTIPLE WAITERS ARE ALL WOKEN BY THE FIRST CHANGE ===')
{
  const h = harness()
  const ps = [0, 1, 2, 3].map((i) => h.activity.wait({ timeoutMs: 10000, member: 'm' + i, reason: 'section 3' }))
  ok(h.activity.status().waiters === 4 && h.activity.status().waitersList.length === 4, 'four live waiters, each addressed and named')
  h.activity.notify({ what: 'roster-changed' })
  const rs = await Promise.all(ps)
  ok(rs.every((r) => r.timedOut === false && r.notified.what === 'roster-changed'), 'all four woke on the same change')
  ok(new Set(rs.map((r) => r.member)).size === 4, 'and each receipt keeps the member it was opened for', rs.map((r) => r.member))
  ok(h.activity.status().waiters === 0 && h.disposerCalls.length === 4, 'all four unregistered and all four disposers ran')
  const rm = h.activity.wait({ timeoutMs: 10000, member: 'm9', reason: 'why' })
  const r = await (async () => { h.activity.notify({ what: 'x' }); return rm })()
  ok(r.member === 'm9' && r.reason === 'why', 'the receipt echoes who waited and why', r)
}

console.log('=== 4. TIMEOUT: resolves, unregisters, disposes ===')
{
  const h = harness()
  const p = h.activity.wait({ timeoutMs: 12345 })
  ok(h.armedMs()[0] === 12345, 'the declared timeout is what was armed', h.armedMs())
  h.advance(12345)
  h.fireNext()
  const r = await p
  ok(r.ok === true && r.timedOut === true && r.waitedMs === 12345, 'the timeout is reported as a timeout with the elapsed clock', r)
  ok(h.disposerCalls.length === 1 && h.pending() === 0, 'and the timer is gone', [h.disposerCalls, h.pending()])
  ok(h.activity.status().timedOut === 1, 'the status counts the timeout', h.activity.status().timedOut)
  // A woken waiter and a timed-out waiter are DIFFERENT outcomes: two sequential waits, one of each.
  const w = h.activity.wait({ timeoutMs: 10000 })
  h.activity.notify({ what: 'n' })
  await w
  const to = h.activity.wait({ timeoutMs: 10000 })
  h.fireNext()
  const rt = await to
  ok(rt.timedOut === true, 'the second waiter timed out while the first was woken', rt)
  const st = h.activity.status()
  ok(st.woken === 1 && st.timedOut === 2 && st.disposersCalled === 3, 'the counters keep the two outcomes apart', { woken: st.woken, timedOut: st.timedOut, disposers: st.disposersCalled })
}

console.log('=== 5. ABORT: named, reason preserved, cleanup on every branch ===')
{
  const h = harness()
  const ac = new AbortController()
  const p = h.activity.wait({ timeoutMs: 10000, signal: ac.signal })
  ac.abort()
  const e = await rejectionOf(p, CODE.aborted)
  ok(!!e && e.abortReason && e.abortReason.name === 'AbortError', 'the signal reason survives on abortReason (a DOMException named AbortError)', e && e.abortReason && e.abortReason.name)
  ok(!!e && e.cause === e.abortReason, 'and the reason is also the error cause', !!e && e.cause === e.abortReason)
  ok(h.disposerCalls.length === 1 && h.pending() === 0, 'the abort branch ran the disposer exactly once', [h.disposerCalls, h.pending()])
  ok(h.activity.status().aborted === 1 && h.activity.status().waiters === 0, 'the abort is counted and the waiter is gone')
  // An Error reason is preserved as the message and the cause (v5r rejects with the reason when it is an Error).
  const h2 = harness()
  const ac2 = new AbortController()
  const p2 = h2.activity.wait({ timeoutMs: 10000, signal: ac2.signal })
  ac2.abort(new Error('the turn was cancelled'))
  const e2 = await rejectionOf(p2, CODE.aborted)
  ok(!!e2 && /the turn was cancelled/.test(e2.message) && e2.abortReason instanceof Error, 'an Error reason is preserved verbatim on the refusal', e2 && e2.message)
  // Abort BEFORE the wait starts: no timer is ever armed, and the promise rejects.
  const h3 = harness()
  const ac3 = new AbortController(); ac3.abort()
  const e3 = await rejectionOf(h3.activity.wait({ timeoutMs: 10000, signal: ac3.signal }), CODE.aborted)
  ok(!!e3 && h3.pending() === 0 && h3.disposerCalls.length === 0 && h3.armed.length === 0,
    'an already-aborted signal rejects without ever arming a timer (nothing to dispose, nothing leaked)', { armed: h3.armed.length, pending: h3.pending() })
  // Abort AFTER a successful wake must not settle twice nor run the disposer twice.
  const h4 = harness()
  const ac4 = new AbortController()
  const p4 = h4.activity.wait({ timeoutMs: 10000, signal: ac4.signal })
  h4.activity.notify({ what: 'n' })
  const r4 = await p4
  ac4.abort()
  await tick()
  ok(r4.timedOut === false && h4.disposerCalls.length === 1 && h4.activity.status().aborted === 0,
    'aborting after the wake changes nothing: one settle, one disposer, no abort counted', { disposers: h4.disposerCalls, aborted: h4.activity.status().aborted })
  // A non-AbortSignal value is refused by name rather than read as "no signal".
  const h5 = harness()
  const bad = refusalOf(() => h5.activity.wait({ timeoutMs: 10000, signal: true }), CODE.signalInvalid)
  ok(!!bad && codeCount(h5.activity.status(), CODE.signalInvalid) === 1, 'a signal that is not AbortSignal-shaped is refused by name and counted')
}

console.log('=== 6. THE TIMEOUT INTERVAL [10000, 3600000]: refuse by default, clamp only when declared ===')
{
  const h = harness()
  const low = refusalOf(() => h.activity.wait({ timeoutMs: 9999 }), CODE.invalidTimeout)
  ok(!!low && low.enforced.includes('vmu.activity.timeoutMinMs') && low.enforced.includes('vmu.activity.timeoutMaxMs') && low.enforced.includes('vmu.activity.timeoutPolicy'),
    'below the v5r minimum is refused with the bounds it evaluated (D3: enforced[] names what was read)', low && low.enforced)
  ok(!!low && low.enforcedScope === 'evaluated-so-far', 'and the refusal states the scope marker used across the kernel', low && low.enforcedScope)
  ok(!!low && typeof low.hint === 'string' && /clamp/.test(low.hint), 'and the hint names the declared alternative (clamp)')
  refusalOf(() => h.activity.wait({ timeoutMs: 3600001 }), CODE.invalidTimeout)
  refusalOf(() => h.activity.wait({ timeoutMs: 10000.5 }), CODE.invalidTimeout)
  refusalOf(() => h.activity.wait({ timeoutMs: 'abc' }), CODE.invalidTimeout)
  ok(codeCount(h.activity.status(), CODE.invalidTimeout) === 4, 'every refused attempt is counted by code', h.activity.status().refusals)
  const okMin = h.activity.wait({ timeoutMs: 10000 })
  const okMax = h.activity.wait({ timeoutMs: 3600000 })
  ok(h.armedMs().join(',') === '10000,3600000', 'both ends of the interval are accepted exactly', h.armedMs())
  h.activity.notify({ what: 'n' })
  await Promise.all([okMin, okMax])
  ok(TIMEOUT_BOUNDS.minMs === 10000 && TIMEOUT_BOUNDS.maxMs === 3600000 && TIMEOUT_BOUNDS.defaultMs === 30000,
    'the module DECLARES the v5r interval and the v5r tool default (30000)', TIMEOUT_BOUNDS)
  // The bounds are settings, not hard-coded twice.
  const hb = harness({ settings: { 'vmu.activity.timeoutMinMs': 100, 'vmu.activity.timeoutMaxMs': 200 } })
  refusalOf(() => hb.activity.wait({ timeoutMs: 99 }), CODE.invalidTimeout)
  refusalOf(() => hb.activity.wait({ timeoutMs: 201 }), CODE.invalidTimeout)
  const okB = hb.activity.wait({ timeoutMs: 150 })
  ok(hb.armedMs()[0] === 150, 'declared bounds really replace the defaults', hb.armedMs())
  hb.fireNext(); await okB
  // An unusable bound pair is named rather than silently ignored.
  const hu = harness({ settings: { 'vmu.activity.timeoutMinMs': 500, 'vmu.activity.timeoutMaxMs': 100 } })
  refusalOf(() => hu.activity.wait({ timeoutMs: 200 }), CODE.boundsInvalid)
  // clamp is the other DECLARED choice, and it reports itself.
  const hc = harness({ settings: { 'vmu.activity.timeoutPolicy': 'clamp' } })
  const pc = hc.activity.wait({ timeoutMs: 1 })
  ok(hc.armedMs()[0] === 10000, 'clamp raises a too-small value to the declared minimum', hc.armedMs())
  hc.fireNext()
  const rc = await pc
  ok(rc.clamped === true && rc.timeoutMs === 10000 && hc.activity.status().clamped === 1, 'and the receipt says it was clamped (never silently)', rc)
  const hc2 = harness({ settings: { 'vmu.activity.timeoutPolicy': 'clamp' } })
  const pc2 = hc2.activity.wait({ timeoutMs: 99999999 })
  ok(hc2.armedMs()[0] === 3600000, 'clamp lowers a too-large value to the declared maximum', hc2.armedMs())
  hc2.fireNext(); await pc2
  ok(hc2.activity.config().timeoutPolicy === 'clamp', 'the policy is reported by config()')
  // The default timeout comes from settings when the caller names none.
  const hd = harness({ settings: { 'vmu.activity.timeoutMs': 45000 } })
  const pd = hd.activity.wait()
  ok(hd.armedMs()[0] === 45000, 'an omitted timeout uses vmu.activity.timeoutMs', hd.armedMs())
  hd.fireNext(); await pd
}

console.log('=== 7. THE WAITER CAP AND "NO TIMER" ARE NAMED, NEVER SILENT ===')
{
  const h = harness({ settings: { 'vmu.activity.maxWaiters': 1 } })
  const p = h.activity.wait({ timeoutMs: 10000 })
  const over = refusalOf(() => h.activity.wait({ timeoutMs: 10000 }), CODE.limit)
  ok(!!over && /vmu.activity.maxWaiters/.test(over.message), 'the cap refuses by name and names its key', over && over.message)
  h.activity.notify({ what: 'n' }); await p
  const h0 = harness({ settings: { 'vmu.activity.maxWaiters': 0 } })
  const p0 = [1, 2].map(() => h0.activity.wait({ timeoutMs: 10000 }))
  ok(h0.activity.status().waiters === 2, '0 means unlimited, and that is stated by the cap being skipped', h0.activity.status().waiters)
  h0.activity.notify({ what: 'n' }); await Promise.all(p0)
  // timer: null = "this deployment has no timer". A wait that cannot time out is refused, not faked.
  const hn = harness({ timer: null })
  const noTimer = refusalOf(() => hn.activity.wait({ timeoutMs: 10000 }), CODE.noTimer)
  ok(!!noTimer && hn.activity.status().timer.shape === 'none', 'timer:null makes wait() refuse by name and say so in status', hn.activity.status().timer)
  // An unplugged or unusable timer seam is a NAMED refusal too.
  refusalOf(() => createActivity({ clock: () => 0, timer: {} }), CODE.timerInvalid)
  const hf = harness({ timer: () => undefined })
  await rejectionOf(hf.activity.wait({ timeoutMs: 10000 }), CODE.timerInvalid)
  ok(hf.pending() === 0 || hf.pending() === undefined, 'and the failed arming left no waiter behind', hf.activity.status().waiters)
}

console.log('=== 8. TIMER SEAM SHAPES (injected first, platform timers second, both reported) ===')
{
  const calls = []
  const seam = normalizeTimer({ timeout: (cb, ms) => { calls.push(ms); return () => calls.push('disposed') } })
  ok(seam.shape === 'timeout->disposer' && seam.injected === true, 'the v5r shape { timeout(cb, ms) -> disposer } is accepted', seam.shape)
  const h = harness({ timer: { timeout: (cb, ms) => { calls.push(ms); return () => calls.push('disposed') } } })
  const p = h.activity.wait({ timeoutMs: 10000 })
  h.activity.notify({ what: 'n' })
  await p
  ok(calls.join(',') === '10000,disposed', 'the injected timer is armed with the timeout and its disposer runs on the wake branch', calls)
  const calls2 = []
  const h2 = harness({ timer: { setTimeout: (cb, ms) => { calls2.push('set:' + ms); return 7 }, clearTimeout: (h2v) => calls2.push('clear:' + h2v) } })
  const p2 = h2.activity.wait({ timeoutMs: 10000 })
  h2.activity.notify({ what: 'n' })
  await p2
  ok(calls2.join(',') === 'set:10000,clear:7', 'the { setTimeout, clearTimeout } shape is wrapped with a real disposer', calls2)
  const h3 = harness({ timer: (cb, ms) => { calls.push('f:' + ms); return () => calls.push('f-disposed') } })
  const p3 = h3.activity.wait({ timeoutMs: 10000 })
  h3.activity.notify({ what: 'n' })
  await p3
  ok(calls.includes('f:10000') && calls.includes('f-disposed'), 'a bare function returning a disposer is accepted', calls.slice(-2))
  ok(normalizeTimer(undefined).shape === 'global-setTimeout',
    'an OMITTED timer means the platform timers, and the shape is reported (never a hidden global)', normalizeTimer(undefined).shape)
  const platform = createActivity({ clock: Date.now, settings: { 'vmu.activity.timeoutMinMs': 5, 'vmu.activity.timeoutMaxMs': 60 } })
  const t0 = Date.now()
  const rp = await platform.wait({ timeoutMs: 10 })
  ok(rp.timedOut === true && Date.now() - t0 < 5000,
    'and the platform fallback really fires instead of hanging (a real wait resolves on its own timeout)', { elapsed: Date.now() - t0 })
  ok(platform.status().timer.shape === 'global-setTimeout' && platform.status().timer.injected === false,
    'status says which timer is in use, so a deployment can tell host-owned from platform-owned', platform.status().timer)
}

console.log('=== 9. THE PEER SHORT-CIRCUIT (v5r: nobody else running => noProgress, no token burn) ===')
{
  const empty = harness({ activePeers: () => [] })
  const r = await empty.activity.wait({ timeoutMs: 10000 })
  ok(r.noProgress && r.noProgress.reason === 'no-active-peer' && r.timedOut === false,
    '★ with no other live member the wait returns immediately with the v5r noProgress reason', r)
  ok(empty.pending() === 0 && empty.activity.status().waiters === 0 && empty.activity.status().skippedNoPeer === 1,
    'and it neither arms a timer nor registers a waiter (that is the point: no waiting at all)', empty.activity.status().skippedNoPeer)
  const self = harness({ activePeers: () => ['m1'] })
  const rs = await self.activity.wait({ timeoutMs: 10000, member: 'm1' })
  ok(rs.noProgress && rs.noProgress.reason === 'no-active-peer', 'the caller itself is not a peer', rs)
  const one = harness({ activePeers: () => ['m1', 'm2'] })
  const p = one.activity.wait({ timeoutMs: 10000, member: 'm1' })
  ok(one.pending() === 1 && one.activity.status().waiters === 1, 'one other live member is enough to wait for', one.pending())
  ok(one.activity.status().peerCheck.seam === true, 'the seam is reported as present')
  one.activity.notify({ what: 'n' })
  const rw = await p
  ok(rw.peerCheck === 'peers=1' && rw.timedOut === false, 'and the receipt says how many peers were seen', rw.peerCheck)
  const off = harness({ activePeers: () => [], settings: { 'vmu.activity.noPeerShortCircuit': false } })
  const po = off.activity.wait({ timeoutMs: 10000 })
  ok(off.pending() === 1, 'vmu.activity.noPeerShortCircuit=false really disables the short-circuit', off.pending())
  off.fireNext(); await po
  const none = harness()
  const pn = none.activity.wait({ timeoutMs: 10000 })
  ok(none.pending() === 1 && none.activity.status().peerCheck.seam === false,
    'without a seam the wait simply waits (and status says the check is unavailable, rather than implying a check happened)', none.activity.status().peerCheck)
  none.fireNext(); await pn
  const broken = harness({ activePeers: () => { throw new Error('roster unavailable') } })
  const pe = refusalOf(() => broken.activity.wait({ timeoutMs: 10000 }), CODE.peerSeamFailed)
  ok(!!pe && /roster unavailable/.test(pe.message), 'a peer seam that throws is REFUSED by name, never read as "nobody is there"', pe && pe.message)
  const badSeam = harness({ activePeers: () => null })
  refusalOf(() => badSeam.activity.wait({ timeoutMs: 10000 }), CODE.peerSeamFailed)
  ok(codeCount(badSeam.activity.status(), CODE.peerSeamFailed) === 1, 'the refusal is counted')
  ok(refusalOf(() => createActivity({ clock: () => 0, activePeers: 'nope' }), 'VMU_INVALID_ARGUMENT') !== null,
    'a peer seam that is not a function is refused at construction')
}

console.log('=== 10. NOTIFICATION RECEIPTS, THE RING, AND PURE READS ===')
{
  const h = harness()
  const a = h.activity.notify({ what: 'w1', at: 5 })
  const b = h.activity.notify({ at: 6 })
  ok(a.seq === 1 && b.seq === 2 && b.what === 'state-change', 'the sequence advances and an unnamed notification is named by default', [a, b])
  ok(a.notified === 0 && a.waiters === 0, 'a notification with no waiter reports notified:0 (never a pretend wake)', a)
  const st = h.activity.status()
  ok(st.notifications === 2 && st.lastNotification.seq === 2 && st.lastNotification.at === 6, 'the status carries the last notification verbatim', st.lastNotification)
  for (let i = 0; i < 30; i++) h.activity.notify({ what: 'ring-' + i })
  const st2 = h.activity.status()
  ok(st2.notificationRing.length === 5 && st2.ringDropped > 0,
    'the notification ring is bounded and the drops are COUNTED (a silent trim would hide loss)', { ring: st2.notificationRing.length, dropped: st2.ringDropped })
  const before = JSON.stringify(Object.assign({}, st2, { at: 0, notificationRing: null, lastNotification: null }))
  const again = JSON.stringify(Object.assign({}, h.activity.status(), { at: 0, notificationRing: null, lastNotification: null }))
  ok(before === again, 'reading the status twice changes nothing (reads are pure)', { before: before.slice(0, 60) })
  const keys = h.activity.keysUsed()
  // RULE E (round 3): two lists agreeing is vacuous when BOTH could be empty, so the sizes are pinned first -
  // the claim is "seven keys, and every one of them is wired", and that claim must not survive an empty list.
  ok(ACTIVITY_KEYS.length > 0 && WIRED_ACTIVITY_KEYS.length > 0
    && JSON.stringify(keys) === JSON.stringify(ACTIVITY_KEYS) && JSON.stringify(WIRED_ACTIVITY_KEYS) === JSON.stringify(ACTIVITY_KEYS),
    'keysUsed() lists the seven keys and every one of them is wired (non-vacuous: the lists must be non-empty first)',
    JSON.stringify({ keysUsed: keys.length, activityKeys: ACTIVITY_KEYS.length, wired: WIRED_ACTIVITY_KEYS.length }))
  const part = h.activity.partition()
  ok(part.wired.length === 7 && part.planned.length === 0 && part.unwired.length === 0, 'partition() reports no planned and no unwired key', part)
  const cfg = h.activity.config()
  ok(cfg.timeoutMs === 30000 && cfg.timeoutMinMs === 10000 && cfg.timeoutMaxMs === 3600000 && cfg.timeoutPolicy === 'refuse' && cfg.maxWaiters === 128 && cfg.noPeerShortCircuit === true,
    'config() reports the declared defaults (the v5r interval and the v5r tool default)', cfg)
  ok(typeof h.activity.refusals() === 'object', 'refusals() is readable')
  ok(h.activity.status().invariants.futureOnly === true && h.activity.status().invariants.oneShot === true,
    'the status SELF-DISCLOSES the two invariants this face exists for', h.activity.status().invariants)
  ok(h.activity.status().registeredHooks > 20, 'and how much hook vocabulary the wake subscription can be checked against', h.activity.status().registeredHooks)
}

console.log('=== 11. EVERY DECLARED KEY REALLY DECIDES SOMETHING ===')
{
  // A recording settings view: keysUsed() claims seven keys; this proves each is READ, and each probe below proves the
  // value CHANGES the outcome (the "disposable enum" defect class: declared, never consulted).
  const reads = new Set()
  const values = {
    'vmu.activity.timeoutMs': 150, 'vmu.activity.timeoutMinMs': 100, 'vmu.activity.timeoutMaxMs': 200,
    'vmu.activity.timeoutPolicy': 'refuse', 'vmu.activity.wakeOn': [], 'vmu.activity.maxWaiters': 3,
    'vmu.activity.noPeerShortCircuit': true,
  }
  // (a plain `harness` passes its settings object straight to the factory, so the recording view is built directly)
  const recording = createActivity({ clock: () => 0, log: () => {}, settings: { get: (k) => { reads.add(k); return values[k] } }, timer: { timeout: () => () => {} }, bus: null })
  const pw = recording.wait()
  recording.notify({ what: 'n' })
  await pw
  // RULE E (round 3, vmu-verify's finding): "reads.size === ACTIVITY_KEYS.length" is vacuous when BOTH are 0, so the
  // claim is pinned non-empty on BOTH sides first - "seven keys, and every one of them is read" cannot pass empty.
  ok(ACTIVITY_KEYS.length > 0 && reads.size > 0 && reads.size === ACTIVITY_KEYS.length && ACTIVITY_KEYS.every((k) => reads.has(k)),
    '★ every key keysUsed() claims is REALLY read (non-vacuous: both sets pinned non-empty first)', { reads: [...reads], missing: ACTIVITY_KEYS.filter((k) => !reads.has(k)) })
  // timeoutMs: armed value follows it.
  const t1 = harness({ settings: { 'vmu.activity.timeoutMs': 22000 } })
  const p1 = t1.activity.wait()
  ok(t1.armedMs()[0] === 22000, 'vmu.activity.timeoutMs decides the default wait length', t1.armedMs())
  t1.fireNext(); await p1
  // timeoutMinMs / timeoutMaxMs: the accepted window moves.
  const t2 = harness({ settings: { 'vmu.activity.timeoutMinMs': 500, 'vmu.activity.timeoutMaxMs': 600 } })
  refusalOf(() => t2.activity.wait({ timeoutMs: 499 }), CODE.invalidTimeout)
  const p2 = t2.activity.wait({ timeoutMs: 600 })
  ok(t2.armedMs()[0] === 600, 'the declared min/max decide what is accepted', t2.armedMs())
  t2.fireNext(); await p2
  // timeoutPolicy: refuse vs clamp changes the outcome of the SAME call.
  const refusePolicy = harness()
  const clampPolicy = harness({ settings: { 'vmu.activity.timeoutPolicy': 'clamp' } })
  const sameBelow = 5
  let refuseOutcome = 'refused'
  try { refusePolicy.activity.wait({ timeoutMs: sameBelow }) } catch (e) { refuseOutcome = e.code }
  const clampedPromise = clampPolicy.activity.wait({ timeoutMs: sameBelow })
  clampPolicy.fireNext()
  const clampedReceipt = await clampedPromise
  ok(refuseOutcome === CODE.invalidTimeout && clampedReceipt.clamped === true,
    '★ vmu.activity.timeoutPolicy changes the outcome of the identical call', { refuseOutcome, clamped: clampedReceipt.clamped })
  // maxWaiters: 1 blocks the second waiter, 0 does not.
  const cap1 = harness({ settings: { 'vmu.activity.maxWaiters': 1 } })
  const capP = cap1.activity.wait({ timeoutMs: 10000 })
  refusalOf(() => cap1.activity.wait({ timeoutMs: 10000 }), CODE.limit)
  cap1.activity.notify({ what: 'n' }); await capP
  const cap0 = harness({ settings: { 'vmu.activity.maxWaiters': 0 } })
  const cap0P = cap0.activity.wait({ timeoutMs: 10000 })
  const cap0P2 = cap0.activity.wait({ timeoutMs: 10000 })
  ok(cap0.activity.status().waiters === 2, 'vmu.activity.maxWaiters decides the cap (0 = unlimited)', cap0.activity.status().waiters)
  cap0.activity.notify({ what: 'n' }); await Promise.all([cap0P, cap0P2])
  // noPeerShortCircuit: with an empty peer list it decides wait-vs-return.
  const shortcut = harness({ activePeers: () => [] })
  const sc = await shortcut.activity.wait({ timeoutMs: 10000 })
  const noShortcut = harness({ activePeers: () => [], settings: { 'vmu.activity.noPeerShortCircuit': false } })
  const nsc = noShortcut.activity.wait({ timeoutMs: 10000 })
  ok(sc.noProgress !== undefined && noShortcut.pending() === 1,
    '★ vmu.activity.noPeerShortCircuit decides whether an empty institute returns at once or waits', { skipped: sc.noProgress.reason, armed: noShortcut.pending() })
  noShortcut.fireNext(); await nsc
  // wakeOn: declaring a hook subscribes the bus; not declaring it does not.
  const plainBus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 0 } })
  const without = createActivity({ clock: () => 0, settings: {}, bus: plainBus, timer: { timeout: () => () => {} } })
  const wakeBus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 0 } })
  const withWake = createActivity({ clock: () => 0, settings: { 'vmu.activity.wakeOn': ['chat/sent'] }, bus: wakeBus, timer: { timeout: () => () => {} } })
  ok(plainBus.status().entries.length === 0 && withWake.status().wake.wired === true,
    '★ vmu.activity.wakeOn decides whether a bus wake subscription exists (default = zero mechanism)', { entries: plainBus.status().entries.length, wired: withWake.status().wake.wired })
  ok(without.status().wake.declared.length === 0, 'and with nothing declared the wake list is empty, not undefined')
}

console.log('=== 12. A DECLARED WAKE HOOK WAKES THE WAITERS FOR REAL (real bus) ===')
{
  const bus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 0 } })
  const h = harness({ bus, settings: { 'vmu.activity.wakeOn': ['chat/sent', 'mailbox/delivered'] } })
  const st = h.activity.status()
  ok(st.wake.wired === true && st.wake.entryId === WAKE_ENTRY_ID && st.wake.problems.length === 0,
    'the ONE wake entry is registered under its published id, with no problems reported', st.wake)
  const entry = bus.status().entries.find((e) => e.id === WAKE_ENTRY_ID)
  ok(!!entry && entry.kind === 'module' && entry.failure === 'open' && JSON.stringify(entry.on) === JSON.stringify(['chat/sent', 'mailbox/delivered']),
    'it observes (failure:open) exactly the declared hooks, so a broken wake can never refuse the producer', entry)
  const p = h.activity.wait({ timeoutMs: 10000, reason: 'bus wake' })
  const emitted = await bus.emit('chat/sent', { by: 'm1' })
  const r = await p
  ok(r.timedOut === false && r.notified.what === 'hook:chat/sent', '★ a real committed hook wakes the waiter', r.notified)
  ok(emitted.ok === true && emitted.decisions.length === 0 && emitted.decision === null,
    'and the wake listener contributes NO decision to the bus (it observes; it never decides)', { ok: emitted.ok, decisions: emitted.decisions.length })
  ok(h.disposerCalls.length === 1, 'the wake branch ran the disposer once', h.disposerCalls)
  const p2 = h.activity.wait({ timeoutMs: 10000 })
  await bus.emit('control/paused', {})
  await tick()
  ok(h.pending() === 1 && h.activity.status().waiters === 1, 'a hook that was NOT declared does not wake anybody', h.pending())
  h.fireNext()
  await p2
  // A typo is reported by name and subscribes to nothing (the alternative is a listener that silently never runs).
  const typoBus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 0 } })
  const typo = createActivity({ clock: () => 0, settings: { 'vmu.activity.wakeOn': ['chat/kaput'] }, bus: typoBus, timer: { timeout: () => () => {} } })
  const tst = typo.status()
  ok(tst.wake.wired === false && tst.wake.problems.length === 1 && tst.wake.problems[0].code === CODE.wakeHookUnknown,
    '★ an unregistered hook name is a NAMED problem, not a silent no-op subscription', tst.wake)
  ok(typoBus.status().entries.length === 0, 'and nothing was registered for it')
  // Declared but no bus: also named (a declared wake that cannot exist must not look wired).
  const noBus = createActivity({ clock: () => 0, settings: { 'vmu.activity.wakeOn': ['chat/sent'] }, timer: { timeout: () => () => {} } })
  ok(noBus.status().wake.wired === false && noBus.status().wake.problems.length === 1,
    'declaring wakeOn without a bus is reported as a problem rather than silently ignored', noBus.status().wake)
  ok(normalizeWakeOn('chat/sent').hooks.length === 1 && normalizeWakeOn(['chat/sent', 'chat/sent']).hooks.length === 1,
    'wakeOn accepts a string or a list, and de-duplicates it', normalizeWakeOn(['chat/sent', 'chat/sent']))
}

console.log('=== 13. DISPOSE: every pending wait ends BY NAME and the wake subscription stops ===')
{
  const bus = createBus({ settings: { 'vmu.middleware.hookTimeoutMs': 0 } })
  const h = harness({ bus, settings: { 'vmu.activity.wakeOn': ['chat/sent'] } })
  const p1 = h.activity.wait({ timeoutMs: 10000 })
  const p2 = h.activity.wait({ timeoutMs: 10000 })
  const d = h.activity.dispose({ reason: 'test teardown' })
  ok(d.ok === true && d.disposed === true && d.closedWaiters === 2, 'dispose reports how many waiters it closed by name', d)
  const e1 = await rejectionOf(p1, CODE.disposed)
  const e2 = await rejectionOf(p2, CODE.disposed)
  ok(!!e1 && !!e2 && h.disposerCalls.length === 2 && h.pending() === 0,
    'a disposed wait is NOT reported as satisfied: both reject and both disposers ran', { disposers: h.disposerCalls, pending: h.pending() })
  ok(bus.status().entries.find((e) => e.id === WAKE_ENTRY_ID).enabled === false, 'and the wake entry is disabled by name')
  const again = h.activity.dispose()
  ok(again.alreadyDisposed === true && again.closedWaiters === 0, 'dispose is idempotent', again)
  refusalOf(() => h.activity.wait({ timeoutMs: 10000 }), CODE.disposed)
  refusalOf(() => h.activity.notify({ what: 'x' }), CODE.disposed)
  ok(h.activity.status().disposed === true, 'status says the face is disposed')
}

console.log('=== 14. DETERMINISM (same scenario twice ⇒ the same reading) ===')
{
  const scenario = async () => {
    const h = harness()
    h.activity.notify({ what: 'history' })
    const p = h.activity.wait({ timeoutMs: 10000, member: 'm1', reason: 'r' })
    h.advance(10)
    h.activity.notify({ what: 'news' })
    await p
    const t = h.activity.wait({ timeoutMs: 10000 })
    h.advance(10000); h.fireNext(); await t
    const st = h.activity.status()
    return Object.assign({}, st, { at: 0, lastNotification: null, notificationRing: null })
  }
  const a = JSON.stringify(await scenario())
  const b = JSON.stringify(await scenario())
  ok(a === b, 'the same sequence of waits and notifications yields an identical status (injected clock)', { a: a.slice(0, 80), b: b.slice(0, 80) })
}

console.log('=== 15. D3 RECEIPT DISCIPLINE: every receipt names the keys THIS CALL evaluated ===')
{
  // The house noun, measured: a receipt carries `enforced[]` (an ARRAY, never undefined) + `enforcedScope`, and it
  // lists exactly the keys this call consulted. `vmu.activity.wakeOn` is read at CONSTRUCTION, so it must NOT appear
  // in a call's list ("a key the code path never consults must not appear").
  const h = harness()
  const p = h.activity.wait({ timeoutMs: 10000 })          // explicit timeout
  h.activity.notify({ what: 'n' })
  const rc = await p
  ok(Array.isArray(rc.enforced) && rc.enforcedScope === 'evaluated-so-far', 'a woken receipt carries enforced[] + the scope marker', rc.enforced)
  ok(json(rc.enforced) === json(['vmu.activity.timeoutPolicy', 'vmu.activity.timeoutMinMs', 'vmu.activity.timeoutMaxMs', 'vmu.activity.maxWaiters']),
    '★ and it lists exactly the keys this call consulted — an EXPLICIT timeout means `vmu.activity.timeoutMs` was never consulted', rc.enforced)
  ok(rc.enforced.indexOf('vmu.activity.wakeOn') === -1, '★ the construction-time key (`wakeOn`) is NOT claimed by a call receipt', rc.enforced)
  ok(rc.enforced.length === new Set(rc.enforced).size, 'and the list has no duplicates', rc.enforced)
  const h2 = harness()
  const p2 = h2.activity.wait()                             // omitted timeout ⇒ the default is consulted
  h2.activity.notify({ what: 'n' })
  const rc2 = await p2
  ok(rc2.enforced.indexOf('vmu.activity.timeoutMs') !== -1, 'an omitted timeout DOES list `vmu.activity.timeoutMs` (the default was consulted)', rc2.enforced)
  const h3 = harness({ activePeers: () => ['m2'] })
  const p3 = h3.activity.wait({ timeoutMs: 10000 })
  h3.activity.notify({ what: 'n' })
  const rc3 = await p3
  ok(rc3.enforced.indexOf('vmu.activity.noPeerShortCircuit') !== -1, 'with a peer seam the short-circuit key is in the list (its value decided something)', rc3.enforced)
  ok(rc.enforced.indexOf('vmu.activity.noPeerShortCircuit') === -1, 'and without a seam that key is absent (it was never consulted for this call)', rc.enforced)
  const h4 = harness()
  const t4 = h4.activity.wait({ timeoutMs: 10000 })
  h4.advance(10000); h4.fireNext()
  const rt4 = await t4
  ok(Array.isArray(rt4.enforced) && rt4.enforcedScope === 'evaluated-so-far', 'a timeout receipt carries the same scope', rt4.enforced)
  const np = await harness({ activePeers: () => [] }).activity.wait({ timeoutMs: 10000 })
  ok(Array.isArray(np.enforced) && np.enforced.indexOf('vmu.activity.noPeerShortCircuit') !== -1, 'and the noProgress receipt does too', np.enforced)
  const h5 = harness()
  ok(json(h5.activity.notify({ what: 'x' }).enforced) === '[]', 'notify() consults no key: its enforced[] is EXPLICITLY empty (never undefined)', h5.activity.notify({ what: 'x' }).enforced)
  ok(json(h5.activity.dispose().enforced) === '[]', 'dispose() likewise (never undefined)', h5.activity.dispose().enforced)
}

console.log('=== VMU ACTIVITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
