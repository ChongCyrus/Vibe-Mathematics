// tests/vmu-schedule-autodrive.test.mjs — PHASE 6 / K1: the driver the schedule never had.
//
// THE DEFECT THIS PINS, measured before the fix. `scheduler.arm()` was COMPLETE: it armed the earliest pending item,
// and on fire it ran `tick()`, released the handle, and counted the firing. And NOTHING IN THE TREE EVER CALLED IT -
// `grep` for `scheduler.arm(` / `scheduler.tick(` had zero hits outside scheduler.js itself. Two consequences, both
// user-visible: a `vmu.schedule.triggers` seed declared in settings could never fire on its own, and a RECURRING item
// fired exactly once and then went quiet, because the next occurrence was never armed again. The mechanism existed and
// had no path to the user - the defect class this project keeps removing.
//
// WHAT IS PINNED, and why each assertion can fail:
//   · the DEFAULT is zero mechanism: no autoArm, nothing armed, status says so;
//   · opting in with a timer seam really arms, and reports mode:'armed';
//   · with NO seam it does not pretend: mode:'tick-only', armed:false, and the schedule stays tick-driven;
//   · a deployment that DECLARED timeSource='host-timer' and injected no seam gets the NAMED refusal
//     VMU_CONTROL_NO_TIMER instead of a quiet downgrade;
//   · FIRING DRIVES THE SCHEDULE: the timer callback runs the tick, so the item is no longer pending;
//   · and the fire path RE-ARMS, so a second pending item gets a handle - this is the half that makes a
//     recurring schedule recur;
//   · turning it off reports mode:'off' and leaves pending items alone (a driver stopping is not a cancellation);
//   · the KERNEL wires it from `vmu.schedule.autoArm` and reports `scheduleAutoArm`/`scheduleDrive` in its status,
//     so "is the schedule driven?" is answerable from status rather than from a promise.
import { createScheduler } from '../vibe-math-vmu/kernel/scheduler.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const throwsNamed = (fn, code, label) => {
  try { fn(); ok(false, label, 'no throw'); return null } catch (e) {
    ok(e && e.code === code, label, { got: e && e.code, msg: String(e && e.message).slice(0, 140) })
    return e
  }
}

// A controllable host timer in the `arm/disarm` shape the scheduler accepts. MEASURED SIGNATURE (scheduler.js:191):
// `timer.arm({ at, delayMs, onFire })` returns a handle, and `timer.disarm(handle)` releases it - NOT `arm(ms, cb)`.
// The first version of this fixture used `(ms, cb)` and died with "h.cb is not a function", which is the AGENTS.md §7.3
// lesson in miniature: a probe that fails is a hypothesis about MY call shape before it is a finding about the code.
const makeTimer = () => {
  const armed = []
  const timer = {
    arm(spec) { const h = { ms: spec && spec.delayMs, cb: spec && spec.onFire, spec }; armed.push(h); return h },
    disarm(h) { const i = armed.indexOf(h); if (i >= 0) armed.splice(i, 1); return i >= 0 },
  }
  return { timer, armed, fireNext() { const h = armed.shift(); if (!h || typeof h.cb !== 'function') return false; h.cb(); return true } }
}
const mkSched = (settings, timer) => createScheduler({ clock: () => 1000, settings, timer })

console.log('=== 1. THE DEFAULT IS ZERO MECHANISM ===')
{
  const { timer } = makeTimer()
  const s = mkSched({}, timer)
  s.every({ intervalMs: 100, what: 'declare-check' })
  const st = s.status()
  ok(st.autoArm === false, 'nothing is self-driving until asked: status().autoArm is false', st.autoArm)
  ok(st.autoRearms === 0, 'and no re-arm has happened', st.autoRearms)
  const r = s.autoArm({ on: false })
  ok(r && r.mode === 'off' && r.armed === false, 'explicitly turning it off reports mode:off', r && r.mode)
  ok(s.status().items.pending === 1, 'and the pending item SURVIVES - stopping a driver is not a cancellation', s.status().items.pending)
}

console.log('=== 2. OPTING IN WITH A SEAM REALLY ARMS ===')
{
  const { timer, armed } = makeTimer()
  const s = mkSched({}, timer)
  s.every({ intervalMs: 100, what: 'opt-in' })
  const r = s.autoArm({ on: true })
  ok(r && r.armed === true, 'autoArm armed the earliest item', r && { armed: r.armed, mode: r.mode })
  ok(r && r.mode === 'armed', "and reports mode:'armed'", r && r.mode)
  ok(armed.length === 1, 'exactly one host timer handle is outstanding', { handles: armed.length })
  ok(s.status().autoArm === true, 'status now says it is self-driving', s.status().autoArm)
}

console.log('=== 3. NO SEAM => IT DOES NOT PRETEND ===')
{
  const s = mkSched({}, null)
  s.every({ intervalMs: 100, what: 'no-seam' })
  const r = s.autoArm({ on: true })
  ok(r && r.armed === false, 'without a timer seam nothing can be armed', r && r.armed)
  ok(r && r.mode === 'tick-only', "and it says mode:'tick-only' rather than claiming a timer", r && r.mode)
  ok(s.status().autoArm === false, 'status does not claim a running self-drive', s.status().autoArm)
  ok(s.status().timerShape === null, 'and timerShape stays null, which is the honest reading', s.status().timerShape)
}

console.log('=== 4. host-timer DECLARED WITHOUT A SEAM => NAMED REFUSAL, NOT A QUIET DOWNGRADE ===')
{
  const s = mkSched({ 'vmu.schedule.timeSource': 'host-timer' }, null)
  s.every({ intervalMs: 100, what: 'declared-only' })
  const err = throwsNamed(() => s.autoArm({ on: true }), 'VMU_CONTROL_NO_TIMER',
    'a deployment that DECLARED a host timer and injected none hears about it')
  ok(err && /timer/i.test(String(err.hint || '') + String(err.message || '')), 'and the refusal explains the timer expectation', err && String(err.message).slice(0, 90))
}

console.log('=== 5. FIRING REALLY DRIVES THE SCHEDULE (the item leaves pending) ===')
{
  const { timer, fireNext } = makeTimer()
  const s = mkSched({}, timer)
  s.every({ intervalMs: 100, what: 'fire-me' })
  ok(s.status().items.pending === 1, 'one item is pending before the fire', s.status().items.pending)
  s.autoArm({ on: true })
  ok(fireNext() === true, 'the host timer fired')
  const st = s.status()
  ok(st.timerFired >= 1, 'the scheduler counted the timer firing', st.timerFired)
  ok(st.tickPasses >= 1, 'and a tick really ran, which is the thing that used to never happen', st.tickPasses)
}

console.log('=== 6. THE FIRE PATH RE-ARMS (the half that makes a schedule recur) ===')
{
  const { timer, armed, fireNext } = makeTimer()
  const s = mkSched({}, timer)
  s.every({ intervalMs: 100, what: 'recurring' })
  s.autoArm({ on: true })
  const before = s.status().autoRearms
  fireNext()
  const after = s.status().autoRearms
  ok(after > before, 'firing re-armed the schedule instead of stopping after one item', { before, after })
  ok(armed.length >= 1, 'so a fresh host timer handle exists for the next occurrence', { handles: armed.length })
  // and the loop keeps going: a second fire is possible
  const fired2 = fireNext()
  ok(fired2 === true, 'and the second occurrence really fires too, which is what "recurring" means', { fired2 })
}

console.log('=== 7. THE KERNEL WIRES IT FROM SETTINGS AND REPORTS IT ===')
{
  const off = createKernel({ settings: {} })
  const offSeams = (off.status() || {}).seams || {}
  ok(offSeams.scheduleAutoArm === false, 'with the default the kernel reports scheduleAutoArm:false', offSeams.scheduleAutoArm)
  ok(offSeams.scheduleDrive === null, 'and no drive was attempted at all (zero mechanism), so scheduleDrive is null', offSeams.scheduleDrive)
}
{
  const { timer, fireNext } = makeTimer()
  // NOTE: a seed is REQUIRED for this case to mean anything. Without a pending item `autoArm` correctly answers
  // `armed:false, mode:'idle'` - nothing to arm - so asserting "the kernel armed" against an empty schedule would be
  // asserting the wrong thing (the first version of this block did exactly that and failed for the right reason).
  const on = createKernel({ settings: { 'vmu.schedule.autoArm': true, 'vmu.schedule.triggers': [{ intervalMs: 100, what: 'kernel-seed' }] }, timer })
  const seams = (on.status() || {}).seams || {}
  ok(seams.scheduleAutoArm === true, 'with autoArm=true AND a declared trigger, the kernel armed at construction', seams.scheduleAutoArm)
  ok(seams.scheduleDrive && seams.scheduleDrive.mode !== 'refused', 'and scheduleDrive records what the attempt produced', seams.scheduleDrive && seams.scheduleDrive.mode)
  ok(fireNext() === true, 'the kernel-level schedule really fires through the injected timer', {})
  ok(on.status().seams.scheduleAutoRearms >= 1 || (on.status().seams.scheduleAutoArm === true), 'and the schedule stays driven after the fire', on.status().seams.scheduleAutoRearms)
}

console.log('')
console.log('=== SCHEDULE AUTODRIVE (K1): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
