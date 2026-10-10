// Independent test for vmu kernel · scheduler (no dependency on kernel/index.js).
// Spec source: docs/08-primitives-meeting-ballot-workflow.md §5 / §12.6 / §19.6 (control flow + schedule family),
// docs/21-observability-and-operations.md §5.3 (alerting owns thresholds; the scheduler only reports).
// Hard invariants under test: ① the timer is an INJECTED seam (no seam ⇒ tick() only, never a pretended timer)
// ② `triggerVia` defaults to `none` ⇒ due items are REPORTED, not triggered ③ due-ness uses the injected clock
// ④ pending items have a cap with a named refusal (current/limit) ⑤ cancelling is audited; tick() reports
// fired/reported/dropped/skipped (an overdue item is never silently discarded).
// Run: node tests/vmu-scheduler.test.mjs     Last line: === VMU SCHEDULER: N passed, M failed ===
import { createScheduler, refuse } from '../vibe-math-vmu/kernel/scheduler.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus({ throwOnEmit = false } = {}) {
  const rows = []; const topics = []
  return { rows, topics, declareTopic: (n) => { topics.push(n); return { ok: true, topic: n, existing: false } }, emit: (h, p) => { if (throwOnEmit) throw new Error('bus down'); rows.push({ hook: h, payload: p }) } }
}
function fakeTimer({ fail = false } = {}) {
  const armed = []; const cleared = []
  return {
    armed, cleared,
    arm({ at, delayMs, onFire }) { if (fail) throw new Error('timer down'); const h = { at, delayMs, onFire }; armed.push(h); return { id: 'h-' + armed.length } },
    disarm(h) { if (fail) throw new Error('timer down'); cleared.push(h); return true },
  }
}
const S = (extra = {}) => Object.assign({ 'vmu.schedule.maxPending': 8 }, extra)

// ── 1. zero mechanism: nothing configured ⇒ empty answers, no throw, no timer ─────────────────────────
{
  const c = fakeClock(0)
  const s = createScheduler({ clock: c.clock })
  ok(s.status().configured === false && s.status().timerInjected === false, 'zero-mechanism: status() says unconfigured and timer-less')
  ok(s.due().count === 0 && s.due().due.length === 0, 'zero-mechanism: due() is empty')
  const t = s.tick()
  ok(t.ok === true && t.firedCount === 0 && t.reportedCount === 0 && t.droppedCount === 0, 'zero-mechanism: tick() is a harmless no-op')
  ok(s.list().count === 0 && s.list().configured === false, 'zero-mechanism: list() is empty')
  ok(s.history().count === 0, 'zero-mechanism: history() is empty')
  const a = s.arm()
  ok(a.ok === true && a.armed === false && a.mode === 'tick-only', 'zero-mechanism: arm() reports tick-only (no pretended timer)')
  ok(a.armedIds.length === 0 && /tick\(/.test(a.note), 'zero-mechanism: the note says how to advance the schedule')
}

// ── 2. INVARIANT ①: the timer is an INJECTED seam ─────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const noTimer = createScheduler({ clock: c.clock, settings: S() })
  ok(noTimer.status().timerInjected === false && noTimer.status().timerShape === null, '①: no seam ⇒ timerInjected=false, shape=null')
  noTimer.once({ inMs: 100, what: 'lab/heartbeat' })
  const a1 = noTimer.arm()
  ok(a1.armed === false && a1.mode === 'tick-only', '①: arm() without a seam does NOT arm anything')
  ok(noTimer.status().items.armed === 0, '①: no handle is recorded when there is no seam')

  const timer = fakeTimer()
  const withTimer = createScheduler({ clock: c.clock, settings: S(), timer })
  const item = withTimer.once({ inMs: 100, what: 'lab/heartbeat' })
  const a2 = withTimer.arm()
  ok(a2.armed === true && a2.mode === 'host-timer' && a2.shape === 'arm/disarm', '①: an injected seam is used and its shape is reported')
  ok(a2.armedIds.join(',') === item.id && timer.armed.length === 1, '①: exactly the earliest item is armed')
  ok(withTimer.status().items.armed === 1, '①: status() counts the armed handle')
  const d = withTimer.disarm({ id: item.id })
  ok(d.disarmed.join(',') === item.id && timer.cleared.length === 1, '①: disarm() releases the handle (the item stays pending)')
  ok(withTimer.list().items[0].state === 'pending', '①: disarming is not cancelling')
  const cfg = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.timeSource': 'host-timer' }) })
  const e = throwsNamed(() => cfg.arm(), 'VMU_CONTROL_NO_TIMER', '①: timeSource=host-timer without a seam is refused by name')
  ok(!!e && /timer/.test(String(e.hint)), '①: the refusal explains how to inject the seam')
  const broken = createScheduler({ clock: c.clock, settings: S(), timer: fakeTimer({ fail: true }) })
  broken.once({ inMs: 10, what: 'lab/x' })
  const ab = broken.arm()
  ok(ab.ok === true && ab.armed === false, '①: a broken seam degrades to unarmed instead of crashing')
  ok(broken.status().unwired['timer-seam'] === 1, '①: the broken seam is COUNTED as a wiring gap')
}

// ── 3. INVARIANT ②: triggerVia=none ⇒ due items are reported, NOT triggered ───────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const log = fakeLog()
  const s = createScheduler({ clock: c.clock, settings: S(), bus, log })
  ok(s.status().triggerVia === 'none', '②: triggerVia defaults to none')
  const item = s.once({ inMs: 100, what: 'lab/heartbeat' })
  ok(item.willTrigger === false, '②: registration states that nothing will be triggered')
  c.advance(150)
  const due = s.due()
  ok(due.count === 1 && due.due[0].id === item.id && /REPORTED only/.test(due.note), '②: due() reports the item and says it is report-only')
  const t = s.tick()
  ok(t.reportedCount === 1 && t.firedCount === 0, '②: tick() reports instead of firing')
  ok(bus.rows.length === 0, '②: NOTHING was emitted on the bus (no flow was triggered)')
  ok(t.reported[0].code === 'VMU_SCHEDULE_OVERDUE_REPORT', '②: the report carries the documented code')
  ok(log.rows.some((x) => x.type === 'schedule/due' && x.code === 'VMU_SCHEDULE_OVERDUE_REPORT'), '②: the overdue report reaches the audit log')
  ok(s.list().items[0].state === 'completed' && /reported/.test(String(s.list().items[0].completedReason)), '②: the one-shot is completed with an honest reason')

  const bus2 = fakeBus()
  const on = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.triggerVia': 'middleware' }), bus: bus2 })
  const i2 = on.once({ inMs: 50, what: 'lab/heartbeat' })
  ok(i2.willTrigger === true, '②: an explicit triggerVia states that it will trigger')
  c.advance(100)
  const t2 = on.tick()
  ok(t2.firedCount === 1 && t2.fired[0].via === 'middleware', '②: with triggerVia=middleware the item is fired')
  ok(bus2.rows.length === 1 && bus2.rows[0].hook === 'lab/heartbeat' && bus2.rows[0].payload.scheduleId === i2.id, '②: the trigger goes out as a bus hook')
  ok(bus2.topics.includes('lab/heartbeat'), '②: the topic is declared through the documented extension point')
  ok(on.status().triggerVia === 'middleware', '②: status() declares the effective trigger path')
}

// ── 4. INVARIANT ③: due-ness uses the INJECTED clock only ─────────────────────────────────────────────
{
  const c = fakeClock(1000)
  const s = createScheduler({ clock: c.clock, settings: S() })
  s.once({ at: 1500, what: 'lab/x' })
  ok(s.due().count === 0, '③: not due before the injected clock reaches the time')
  c.advance(400)
  ok(s.due().count === 0, '③: still not due at 1400')
  c.advance(100)
  ok(s.due().count === 1, '③: due exactly when the injected clock reaches 1500')
  ok(s.due({ at: 1500 }).count === 1 && s.due({ at: 1499 }).count === 0, '③: due({at}) answers for an explicit moment')
  const s2 = createScheduler({ clock: c.clock, settings: S() })
  ok(s2.once({ inMs: 250, what: 'lab/y' }).at === c.now() + 250, '③: inMs is measured against the injected clock')
  ok(s2.once({ at: '1970-01-01T00:00:01.000Z', what: 'lab/z' }).at === 1000, '③: an ISO timestamp is accepted deterministically (no real time read)')
  throwsNamed(() => s2.once({ at: 'not-a-time', what: 'lab/z' }), 'VMU_SCHEDULE_WINDOW_INVALID', '③: an unparseable time is refused by name')
  throwsNamed(() => s2.once({ what: 'lab/z' }), 'VMU_SCHEDULE_WINDOW_INVALID', '③: once() without a time is refused')
  throwsNamed(() => s2.once({ at: 2000, inMs: 10, what: 'lab/z' }), 'VMU_INVALID_ARGUMENT', '③: both at and inMs is refused')
  const horizon = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.maxHorizonMs': 100 }) })
  throwsNamed(() => horizon.once({ inMs: 5000, what: 'lab/far' }), 'VMU_SCHEDULE_WINDOW_INVALID', '③: a trigger beyond the horizon is refused')
  ok(horizon.once({ inMs: 50, what: 'lab/near' }).ok === true, '③: a trigger inside the horizon is accepted')
}

// ── 5. INVARIANT ④: pending items have a cap (named refusal with current/limit) ───────────────────────
{
  const c = fakeClock(0)
  const s = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.maxPending': 2 }) })
  s.once({ inMs: 100, what: 'lab/a' })
  s.every({ intervalMs: 100, what: 'lab/b' })
  const e = throwsNamed(() => s.once({ inMs: 100, what: 'lab/c' }), 'VMU_SCHEDULE_LIMIT', '④: exceeding the pending cap is refused by name')
  ok(!!e && /2\/2/.test(e.message), '④: the refusal states current/limit (2/2)')
  ok(s.list().count === 2, '④: the refused registration created nothing')
  s.cancel({ id: s.list().items[0].id, by: 'office', reason: 'make room' })
  ok(s.once({ inMs: 100, what: 'lab/c' }).ok === true, '④: after a cancellation there is room again')
  ok(s.status().maxPending === 2, '④: status() reports the cap')
  const unbounded = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.maxPending': 0 }) })
  for (let i = 0; i < 10; i++) unbounded.once({ inMs: 10, what: 'lab/n' + i })
  ok(unbounded.list().count === 10, '④: maxPending=0 means "no cap" (and is reported in status)')
}

// ── 6. INVARIANT ⑤: cancelling is audited; tick() reports fired/reported/dropped/skipped ─────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const s = createScheduler({ clock: c.clock, settings: S(), log })
  const item = s.every({ intervalMs: 100, what: 'lab/heartbeat' })
  throwsNamed(() => s.cancel({ id: item.id, reason: 'x' }), 'VMU_INVALID_ARGUMENT', '⑤: cancelling without an actor is refused')
  throwsNamed(() => s.cancel({ id: item.id, by: 'office' }), 'VMU_REASON_REQUIRED', '⑤: cancelling without a reason is refused')
  throwsNamed(() => s.cancel({ id: 's-404', by: 'office', reason: 'x' }), 'VMU_NO_SUCH_OBJECT', '⑤: an unknown id is refused with the known list')
  const r = s.cancel({ id: item.id, by: 'office', reason: 'no longer needed' })
  ok(r.ok === true && r.by === 'office' && r.reason === 'no longer needed' && r.cancelledAt === 0, '⑤: the cancellation records who/why/when')
  ok(log.rows.some((x) => x.type === 'schedule/cancelled' && x.by === 'office' && x.why === 'no longer needed'), '⑤: the cancellation is audited')
  ok(s.cancel({ id: item.id, by: 'office', reason: 'again' }).already === true, '⑤: cancelling twice is idempotent')
  ok(s.list({ state: 'cancelled' }).count === 1, '⑤: the cancelled item is still listed (nothing is erased)')
  const relaxed = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.cancelNeedsReason': false }) })
  const i2 = relaxed.once({ inMs: 10, what: 'lab/x' })
  ok(relaxed.cancel({ id: i2.id, by: 'office' }).ok === true, '⑤: cancelNeedsReason=false allows a bare cancellation (disclosed in status)')
  ok(relaxed.status().cancelNeedsReason === false, '⑤: status() declares the rule')
  const done = createScheduler({ clock: c.clock, settings: S() })
  const di = done.once({ inMs: 10, what: 'lab/done' })
  c.advance(20)
  done.tick()
  ok(done.list().items[0].state === 'completed', '⑤: the one-shot completed')
  throwsNamed(() => done.cancel({ id: di.id, by: 'office', reason: 'too late' }), 'VMU_STATE', '⑤: cancelling a completed item is refused by name')

  const grace = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.overdueGraceMs': 100 }) })
  grace.once({ inMs: 10, what: 'lab/late' })
  c.advance(500)
  const t = grace.tick()
  ok(t.droppedCount === 1 && t.dropped[0].overdueMs === 490, '⑤: an item overdue beyond the grace is DROPPED and reported with its lateness')
  ok(grace.status().items.cancelled === 1 && /overdue by/.test(String(grace.list().items[0].cancelReason)), '⑤: the dropped item is recorded (never silently discarded)')
  ok(grace.list({ state: 'cancelled' }).count === 1, '⑤: the dropped item remains listed for audit')
  const halted = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.overdueGraceMs': 10 }) })
  const h1 = halted.once({ inMs: 10, what: 'lab/ok' })
  const h2 = halted.once({ inMs: 10, what: 'lab/late2' })
  ok(h1.ok === true && h2.ok === true, '⑤: two items scheduled')
  c.advance(50)
  const t2 = halted.tick()
  ok(t2.reportedCount + t2.droppedCount === 2, '⑤: every due item is either reported or dropped (none is skipped silently)')
}

// ── 7. pause + bus failure + coalescing are all reported, never silent ────────────────────────────────
{
  const c = fakeClock(0)
  let paused = false
  const s = createScheduler({ clock: c.clock, settings: S(), isPaused: () => paused })
  s.once({ inMs: 10, what: 'lab/a' })
  c.advance(20)
  paused = true
  const t = s.tick()
  ok(t.skippedCount === 1 && t.skipped[0].why === 'kernel-paused', 'pause: a due item is SKIPPED while the kernel is paused, and reported')
  ok(s.status().ticks.skipped === 1 && s.status().paused === true, 'pause: the skip is counted and the pause state is exposed')
  ok(s.list().items[0].state === 'pending', 'pause: the skipped item stays pending (nothing is lost)')
  paused = false
  const t2 = s.tick()
  ok(t2.reportedCount === 1, 'pause: after resuming the item is processed')

  const busy = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.triggerVia': 'middleware' }), bus: fakeBus({ throwOnEmit: true }) })
  busy.once({ inMs: 10, what: 'lab/x' })
  c.advance(20)
  const t3 = busy.tick()
  ok(t3.skippedCount === 1 && t3.firedCount === 0, 'bus: a failing bus turns the trigger into a reported skip')
  ok(busy.status().unwired['bus:lab/x'] === 1, 'bus: the failed emit is COUNTED as a wiring gap')

  const co = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.coalesceMissed': true }) })
  const every = co.every({ intervalMs: 100, what: 'lab/beat' })
  c.advance(350)
  const t4 = co.tick()
  ok(t4.coalesced === 2 && t4.reported[0].missed === 2, 'coalesce: two additional missed intervals are coalesced into ONE report and counted')
  ok(co.list().items[0].runs === 1 && co.list().items[0].state === 'pending', 'coalesce: the recurring item ran once and stays pending')
  const noCo = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.coalesceMissed': false }) })
  noCo.every({ intervalMs: 100, what: 'lab/beat' })
  c.advance(350)
  const t5 = noCo.tick()
  ok(t5.coalesced === 0 && t5.reported[0].missed === 2, 'coalesce: disabled ⇒ the missed count is still REPORTED (never hidden)')
  ok(co.list().items[0].id === every.id, 'coalesce: ids are deterministic')
}

// ── 8. recurrences, maxRuns, floors, actions ─────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const s = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.maxRecurrences': 2 }) })
  const it = s.every({ intervalMs: 100, what: 'lab/beat' })
  ok(it.maxRuns === 2, 'recurrence: the default maxRuns comes from vmu.schedule.maxRecurrences')
  c.advance(100); s.tick()
  c.advance(100); s.tick()
  ok(s.list().items[0].runs === 2 && s.list().items[0].state === 'completed', 'recurrence: the run cap completes the item')
  ok(/maxRuns reached \(2\)/.test(String(s.list().items[0].completedReason)), 'recurrence: the completion reason states the cap')
  const floored = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.minIntervalMs': 1000 }) })
  const e = throwsNamed(() => floored.every({ intervalMs: 10, what: 'lab/hot' }), 'VMU_SCHEDULE_RECURRENCE_INVALID', 'recurrence: an interval below the floor is refused')
  ok(!!e && /1000/.test(e.message), 'recurrence: the refusal states the floor')
  const bad = createScheduler({ clock: c.clock, settings: S() })
  throwsNamed(() => bad.every({ what: 'lab/x' }), 'VMU_SCHEDULE_RECURRENCE_INVALID', 'recurrence: every() without an interval is refused')
  throwsNamed(() => bad.every({ intervalMs: 0, what: 'lab/x' }), 'VMU_SCHEDULE_RECURRENCE_INVALID', 'recurrence: a zero interval is refused')
  const acts = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.actionsAllowed': ['emit-hook'] }) })
  const forbidden = throwsNamed(() => acts.once({ inMs: 10, what: 'prompt/ask' }), 'VMU_SCHEDULE_TRIGGER_FORBIDDEN', 'actions: a disallowed action class is refused by name')
  ok(!!forbidden && /emit-hook/.test(String(forbidden.hint)), 'actions: the refusal lists what IS allowed')
  ok(acts.once({ inMs: 10, what: 'lab/ok' }).ok === true, 'actions: an allowed action passes')
  throwsNamed(() => acts.once({ inMs: 10 }), 'VMU_INVALID_ARGUMENT', 'actions: a missing `what` is refused')
  throwsNamed(() => acts.once({ inMs: 10, what: '  ' }), 'VMU_INVALID_ARGUMENT', 'actions: a blank `what` is refused')
}

// ── 9. declarative seeds (vmu.schedule.triggers / vmu.scheduler.triggers) ─────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const seeded = createScheduler({ clock: c.clock, log, settings: S({ 'vmu.schedule.triggers': [{ inMs: 100, what: 'lab/seeded' }, { kind: 'every', intervalMs: 200, what: 'lab/beat' }] }) })
  ok(seeded.list().count === 2, 'seeds: two declarative triggers are registered')
  c.advance(100)
  ok(seeded.due().count === 1, 'seeds: the seeded one-shot becomes due on the injected clock')
  const broken = createScheduler({ clock: c.clock, log, settings: S({ 'vmu.scheduler.triggers': [{ inMs: 100, what: 'lab/bad', intervalMs: -5 }, { inMs: 10, what: 'lab/good' }] }) })
  ok(broken.list().count === 1, 'seeds: a rejected seed does not abort the rest')
  ok(broken.status().unwired['seed-rejected'] === 1 && log.rows.some((x) => x.type === 'schedule/seed-rejected'), 'seeds: a rejected seed is COUNTED and audited, never swallowed')
}

// ── 10. truncation counting + read-only purity + determinism ──────────────────────────────────────────
{
  const c = fakeClock(0)
  const s = createScheduler({ clock: c.clock, settings: S({ 'vmu.schedule.maxPending': 0 }) })
  for (let i = 1; i <= 5; i++) s.once({ inMs: 100 * i, what: 'lab/t' + i })
  const all = s.list()
  ok(all.count === 5 && all.available === 5 && all.dropped === 0 && all.truncated === false, 'list: five items, no truncation')
  const capped = s.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 5 && capped.dropped === 3 && capped.truncated === true, 'list: a limit reports the DROPPED count (3)')
  ok(s.due({ at: 1000, limit: 2 }).dropped === 3, 'due: a limit reports drops')
  const h = s.history({ limit: 2 })
  ok(h.count === 2 && h.available >= 5 && h.dropped === h.available - 2, 'history: the ring reports drops')
  ok(s.list({ kind: 'once' }).count === 5 && s.list({ state: 'completed' }).count === 0, 'list: kind/state filters work')
  const before = JSON.stringify(s.list()) + '|' + JSON.stringify(s.status()) + '|' + JSON.stringify(s.due({ at: 1000 })) + '|' + JSON.stringify(s.history())
  for (let i = 0; i < 3; i++) { s.list(); s.status(); s.due({ at: 1000 }); s.history() }
  const after = JSON.stringify(s.list()) + '|' + JSON.stringify(s.status()) + '|' + JSON.stringify(s.due({ at: 1000 })) + '|' + JSON.stringify(s.history())
  ok(before === after, 'read-only: list/status/due/history never mutate the schedule')
  const build = () => { const cc = fakeClock(7); const x = createScheduler({ clock: cc.clock, settings: S() }); x.once({ inMs: 10, what: 'lab/a' }); x.every({ intervalMs: 20, what: 'lab/b' }); return x }
  const a = build(); const b = build()
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two instances agree on history()')
  ok(createScheduler({ clock: fakeClock(3).clock, settings: S() }).once({ inMs: 1, what: 'lab/x' }).now === 3, 'injected clock: registration time comes from clock() only')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

console.log('=== VMU SCHEDULER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
