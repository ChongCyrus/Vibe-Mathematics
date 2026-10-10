// Independent test for vmu kernel · notify (no dependency on kernel/index.js).
// Run: node tests/vmu-notify.test.mjs     Last line: === VMU NOTIFY: N passed, M failed ===
// ROUND 15: the REAL-BUS / REAL-KERNEL sections at the end exist because every earlier section used a stub bus,
// which accepted a non-string hook - so `notify.emit` crashed bare (`hook.replace is not a function`, bus.js:272)
// the moment it met the actual bus. A stub cannot catch a shape error against a real contract.
import { createNotify, CODE } from '../vibe-math-vmu/kernel/notify.js'
import { createBus } from '../vibe-math-vmu/kernel/bus.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { passed += 1; return e } failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}
function fakeClock(start = 1000) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }
const on = (extra = {}) => ({ 'vmu.notify.enabled': true, ...extra })
function collector() { const sent = []; return { sent, deliver: (n) => { sent.push(n) } } }

// ── 1. default off = zero mechanism ─────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createNotify({ clock: c.clock })
  const r = t.emit({ event: 'task.assigned', object: 'T-1' })
  ok(r.ok === true && r.enabled === false && r.recorded === 0 && r.delivered === 0, 'zero mechanism: emit is a no-op when disabled')
  ok(t.status().defaultOff === true && t.status().enabled === false, 'zero mechanism: status self-discloses the default-off rule')
  ok(t.list().registerSize === 0 && t.list().watchers.length === 0, 'zero mechanism: nothing is recorded and nothing throws')
  ok(t.flush().digests.length === 0, 'zero mechanism: flush is a no-op')
}

// ── 2. deliver is an injected seam: without it, refuse by name AFTER recording ───────────────
{
  const c = fakeClock()
  const t = createNotify({ clock: c.clock, settings: on() })
  t.watch({ subject: 'm1', events: ['task.assigned'] })
  const e = throwsNamed(() => t.emit({ event: 'task.assigned', object: 'T-1' }), CODE.noTransport, 'no transport: emit refuses by name')
  ok(!!e && /nothing is pretended/.test(e.message), 'no transport: the refusal says nothing is pretended')
  const l = t.list()
  ok(l.registerSize === 1 && l.registered[0].delivered === false, 'no transport: the event is still RECORDED (recorded, not delivered)')
  ok(l.delivered === 0 && l.suppressed === 1, 'no transport: it counts as suppressed, never as delivered')
  ok(t.status().transportInjected === false, 'no transport: status discloses that no transport is injected')
}

// ── 3. quiet blocks delivery only; a digest is required on resume ────────────────────────────
{
  const c = fakeClock(0)
  const { sent, deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on({ 'vmu.notify.quiet': false }) })
  t.watch({ subject: 'm1', events: ['task.assigned'], quiet: true })
  const r = t.emit({ event: 'task.assigned', object: 'T-1' })
  ok(r.suppressed === 1 && r.delivered === 0 && sent.length === 0, 'quiet: delivery is blocked')
  ok(t.list().registerSize === 1, 'quiet: the event is STILL recorded (quiet blocks delivery only)')
  ok(t.status().pendingDigests === 1, 'quiet: a digest is pending')
  ok(t.status().quietBlocksDeliveryOnly === true, 'quiet: status states the rule')
  c.advance(10)
  const f = t.flush()
  ok(f.delivered === 1 && sent.length === 1 && sent[0].kind === 'digest', 'resume: flush DELIVERS the digest summary')
  ok(sent[0].counts['task.assigned'] === 1 && sent[0].total === 1, 'resume: the digest carries the per-event counts')
  ok(t.status().pendingDigests === 0, 'resume: the pending digest is cleared after delivery')
  t.unwatch({ id: t.list().watchers[0].id })
  t.watch({ subject: 'm1', events: ['task.assigned'] })
  const g = t.emit({ event: 'task.assigned', object: 'T-2' })
  ok(g.delivered === 1 && sent.length === 2, 'after resume: fresh events deliver normally')
}

// ── 4. dedup window: no duplicate delivery, but the duplicate is counted ────────────────────
{
  const c = fakeClock(0)
  const { sent, deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on({ 'vmu.notify.dedupWindowMs': 100 }) })
  t.watch({ subject: 'm1', events: ['task.assigned'] })
  ok(t.emit({ event: 'task.assigned', object: 'T-1' }).delivered === 1, 'dedup: the first notification is delivered')
  c.advance(50)
  const dup = t.emit({ event: 'task.assigned', object: 'T-1' })
  ok(dup.deduped === 1 && dup.delivered === 0 && sent.length === 1, 'dedup: inside the window it is NOT delivered again')
  ok(t.list().deduped === 1 && t.list().registerSize === 2, 'dedup: the duplicate is counted and recorded')
  c.advance(100)
  ok(t.emit({ event: 'task.assigned', object: 'T-1' }).delivered === 1, 'dedup: outside the window it delivers again')
  const other = t.emit({ event: 'task.assigned', object: 'T-2' })
  ok(other.delivered === 1 && other.deduped === 0, 'dedup: a different object is not a duplicate')
}

// ── 5. subscriptions must name a registered hook ────────────────────────────────────────────
{
  const c = fakeClock()
  const { deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on({ 'vmu.notify.registeredEvents': ['task.assigned', 'meeting.opened'] }) })
  ok(t.watch({ subject: 'm1', events: ['task.assigned'] }).ok === true, 'registry: a registered event is accepted')
  const e = throwsNamed(() => t.watch({ subject: 'm2', events: ['task.assigned', 'gossip'] }), CODE.unregistered, 'registry: an unregistered event is refused by name')
  ok(!!e && /task.assigned, meeting.opened/.test(String(e.hint)), 'registry: the refusal lists the registered events')
  throwsNamed(() => t.emit({ event: 'gossip', object: 'x' }), CODE.unregistered, 'registry: emitting an unregistered event is refused too')
  ok(t.status().eventRegistryKnown === true, 'registry: status discloses that the registry is known')
  const noReg = createNotify({ clock: c.clock, deliver, settings: on() })
  ok(noReg.watch({ subject: 'm1', events: ['anything.goes'] }).ok === true, 'registry: with no registry configured, no validation (zero mechanism)')
  ok(noReg.status().eventRegistryKnown === false, 'registry: status discloses the unknown registry')
}

// ── 6. a failed delivery does not block business, but is recorded and counted ───────────────
{
  const c = fakeClock(0)
  let boom = true
  const sent = []
  const deliver = (n) => { if (boom) { const e = new Error('transport down'); e.code = 'VMU_NOTIFY_DELIVERY_FAILED'; throw e } sent.push(n) }
  const t = createNotify({ clock: c.clock, deliver, settings: on() })
  t.watch({ subject: 'm1', events: ['task.assigned'] })
  const r = t.emit({ event: 'task.assigned', object: 'T-1' })
  ok(r.ok === true && r.failures === 1 && r.delivered === 0, 'failure: emit returns (business is not blocked) and counts the failure')
  const rec = t.list().registered[0]
  ok(rec.reason === 'delivery-failed' && rec.delivered === false, 'failure: the register keeps the failed record with its reason')
  ok(t.status().failedDeliveryDoesNotBlock === true, 'failure: status states that a failure never blocks')
  boom = false
  ok(t.emit({ event: 'task.assigned', object: 'T-2' }).delivered === 1, 'failure: after recovery delivery works again')
  const strict = createNotify({ clock: c.clock, deliver: () => { throw new Error('down') }, settings: on({ 'vmu.notify.onFailure': 'throw' }) })
  strict.watch({ subject: 'm1', events: ['task.assigned'] })
  const e = throwsNamed(() => strict.emit({ event: 'task.assigned', object: 'T-1' }), CODE.deliveryFailed, 'failure: onFailure=throw refuses by name')
  ok(!!e && strict.list().registerSize === 1, 'failure: even when throwing, the record is kept')
}

// ── 7. truncation + watcher cap ─────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const { deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on({ 'vmu.notify.maxRegister': 3 }) })
  t.watch({ subject: 'm1', events: ['e'] })
  for (let i = 0; i < 5; i++) { c.advance(1); t.emit({ event: 'e', object: 'O' + i }) }
  const l = t.list()
  ok(l.registerSize === 3 && l.droppedFromCap === 2, 'truncation: the register is capped and reports dropped=2')
  ok(t.status().droppedFromCap === 2, 'truncation: status repeats the dropped count')
  const cap = createNotify({ clock: c.clock, deliver, settings: on({ 'vmu.notify.maxWatchers': 1 }) })
  cap.watch({ subject: 'm1', events: ['e'] })
  throwsNamed(() => cap.watch({ subject: 'm2', events: ['e'] }), CODE.limit, 'cap: exceeding maxWatchers is refused by name')
  throwsNamed(() => cap.unwatch({ id: 'nope' }), CODE.watchUnknown, 'cap: unwatching an unknown id is refused by name')
}

// ── 8. layering with the alert face is self-disclosed ───────────────────────────────────────
{
  const c = fakeClock()
  const t = createNotify({ clock: c.clock })
  const s = t.status()
  ok(s.fingerprintScope === 'watcher×event×object', 'layering: this module fingerprints watcher×event×object')
  ok(/metric×object×code/.test(s.alertFingerprintScope) && /21/.test(s.alertFingerprintScope), 'layering: the alert fingerprint (metric×object×code, volume 21) is named')
  ok(/21/.test(s.layeringNote) && /NOT redefined/.test(s.layeringNote), 'layering: thresholds/suppression/escalation are explicitly left to volume 21')
}

// ── 9. read-only surfaces never mutate ──────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const { deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on() })
  t.watch({ subject: 'm1', events: ['e'] })
  t.emit({ event: 'e', object: 'O' })
  const st = JSON.stringify(t.status()); const li = JSON.stringify(t.list())
  t.status(); t.list(); t.status(); t.list()
  ok(JSON.stringify(t.status()) === st && JSON.stringify(t.list()) === li, 'read-only: repeated reads leave status()/list() identical')
  ok(t.list().registerSize === 1, 'read-only: the register did not grow from reads')
  ok(t.status().readsArePure === true, 'read-only: status states that reads are pure')
}

// ── 10. determinism (injected clock only) ───────────────────────────────────────────────────
{
  const mk = () => { const c = fakeClock(500); const { deliver } = collector(); const t = createNotify({ clock: c.clock, deliver, settings: on() }); t.watch({ subject: 'm1', events: ['e'] }); t.emit({ event: 'e', object: 'O' }); return t }
  const a = mk(); const b = mk()
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
}

// ── 11. THE REAL BUS (round 15): the forward must be a legal STRING hook, and it must not crash ────────────
{
  const c = fakeClock()
  const bus = createBus({ clock: c.clock })
  const seen = []
  const rawEmit = bus.emit
  bus.emit = (hook, payload, opts) => { seen.push({ hook, payload }); return rawEmit(hook, payload, opts) }
  const { sent, deliver } = collector()
  const t = createNotify({ clock: c.clock, deliver, settings: on(), bus })
  t.watch({ subject: 'seam-probe', events: ['seam/probe'], channel: 'probe' })
  let crashed = null
  let r = null
  try { r = t.emit({ event: 'seam/probe', object: 'seam-probe', payload: { at: 1 } }) } catch (e) { crashed = e }
  ok(crashed === null, 'real bus: emit does NOT throw (was: TypeError hook.replace) :: ' + (crashed && crashed.message))
  ok(r && r.ok === true && r.delivered === 1, 'real bus: the event is delivered through the seam')
  ok(seen.length === 1 && typeof seen[0].hook === 'string' && seen[0].hook === 'notify/emit',
    'real bus: exactly ONE legal STRING hook reached the bus (got ' + JSON.stringify(seen.map((x) => ({ hook: x.hook, type: typeof x.hook })) ) + ')')
  ok(seen[0] && seen[0].payload && seen[0].payload.event === 'seam/probe' && seen[0].payload.delivered === 1,
    'real bus: the payload carries the event facts (event + delivered)')
  ok(sent.length === 1 && sent[0].channel === 'probe' && sent[0].event === 'seam/probe',
    'real bus: the delivery seam was REALLY called once (fake deliver counted it)')
}

// ── 12. THE REAL KERNEL (round 15, the reported repro): createKernel → notify.watch → notify.emit ──────────
{
  const c = fakeClock()
  const { sent, deliver } = collector()
  const k = createKernel({ deliver, clock: c.clock, settings: { 'vmu.core.enabled': true, 'vmu.notify.enabled': true } })
  const seen = []
  const rawEmit = k.bus.emit
  k.bus.emit = (hook, payload, opts) => { seen.push({ hook, payload }); return rawEmit(hook, payload, opts) }
  k.notify.watch({ subject: 'seam-probe', events: ['seam/probe'], channel: 'probe' })
  let crashed = null
  let r = null
  try { r = k.notify.emit({ event: 'seam/probe', object: 'seam-probe', payload: { at: 1 } }) } catch (e) { crashed = e }
  ok(crashed === null, 'real kernel: the reported repro no longer crashes :: ' + (crashed && crashed.message))
  ok(r && r.ok === true && r.delivered === 1, 'real kernel: notify.emit reports one delivery')
  ok(seen.some((x) => x.hook === 'notify/emit' && typeof x.hook === 'string'), 'real kernel: the kernel bus received the legal string hook')
  ok(sent.length === 1 && sent[0].subject === 'seam-probe', 'real kernel: the injected deliver seam was called once with the watcher subject')
}

console.log('=== VMU NOTIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
