// tests/vmu-activity-tool.test.mjs — the `vibe_vmu_wait` face, its host wiring, and the REAL assembly.
//
// Three questions, in three sections:
//   1. does the tool delegate (addressing and calling only) and turn every kernel refusal into a NAMED tool refusal?
//   2. is the face really reachable on a host — declared by `vmu.activity.*` / `config.activity`, absent with no
//      declaration (the zero-mechanism invariant), and are the seven settings keys the schema declares the seven the
//      module reads?
//   3. does the ASSEMBLED kernel behave like the primitive — including the v5r peer short-circuit, a real wake through
//      the bus, a real timeout, and the registry entry a pack author would look up?
import { makeActivitySpec } from '../vibe-math-vmu/tools/activity.js'
import { TOOL_FACES, TOOL_NAMES, faceKeyOf, toolSpecs } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { ACTIVITY_KEYS, CODE, WAKE_ENTRY_ID } from '../vibe-math-vmu/kernel/activity.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
// The two host helpers the adapter hands a spec factory (host.js:355,384) — replicated here so the face can be tested
// WITHOUT the host wiring, which is what makes section 1 an independent contract test rather than a tautology.
const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
const refused = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || null })
const SPEC_NAMES = { activity: 'vibe_vmu_wait' }

console.log('=== 1. THE FACE ADDRESSES AND CALLS; IT DOES NOT RE-IMPLEMENT ===')
{
  const calls = []
  const spy = {
    wait: (args) => { calls.push(args); return Promise.resolve({ ok: true, timedOut: false, notified: { what: 'task/assigned', seq: 7, at: 0 }, member: args.member }) },
    status: () => ({ ok: true, waiters: 2, invariants: { futureOnly: true, oneShot: true } }),
  }
  const spec = makeActivitySpec({ param, refused, TOOL_NAMES: SPEC_NAMES, kernel: { activity: spy } })
  ok(spec.name === SPEC_NAMES.activity, 'the spec publishes the frozen tool name', spec.name)
  ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(['wait', 'status']),
    'the action enum is exactly the two things the face does', spec.parameters.action.enum)
  ok(!!spec.parameters.timeoutMs && spec.parameters.timeoutMs.type === 'number',
    'the timeout is an ordinary parameter (the interval policy belongs to the kernel)', spec.parameters.timeoutMs)
  // The PUBLISHED row in docs/03 §2 names `action`(enum), `timeoutMs`, `why`, `me` — those four must be the real ones.
  ok(JSON.stringify(Object.keys(spec.parameters)) === JSON.stringify(['action', 'timeoutMs', 'why', 'me']),
    '★ the published parameter list IS the face’s parameter list (docs/03: action/timeoutMs/why/me — no drift)', Object.keys(spec.parameters))

  const ac = new AbortController()
  const r1 = await spec.run({ timeoutMs: 12345, me: 'm1', why: 'waiting for a task' }, { signal: ac.signal })
  ok(calls.length === 1 && calls[0].timeoutMs === 12345 && calls[0].signal === ac.signal && calls[0].member === 'm1' && calls[0].reason === 'waiting for a task',
    'wait forwards the timeout, the HOST signal (v5r passed x.signal), the member and the reason', calls[0])
  ok(r1.ok === true && r1.action === 'wait' && r1.timedOut === false && r1.notified.seq === 7,
    'and the receipt is the kernel’s own, forwarded rather than recomputed', r1)
  // The default action is `wait` (v5r had no action parameter at all, so an omitted action must mean "wait").
  await spec.run({})
  ok(calls[calls.length - 1].timeoutMs === undefined && calls[calls.length - 1].signal === null,
    'an omitted action waits, and without a host signal it passes none', calls[calls.length - 1])
  await spec.run({ action: 'wait', timeout_ms: 600000, member: 'm2', reason: 'v5r spelling' })
  ok(calls[calls.length - 1].timeoutMs === 600000 && calls[calls.length - 1].member === 'm2' && calls[calls.length - 1].reason === 'v5r spelling',
    'the v5r spellings (timeout_ms / member / reason) are accepted as aliases so a ported v5r call still works', calls[calls.length - 1])
  const s = await spec.run({ action: 'status' })
  ok(s.ok === true && s.action === 'status' && s.waiters === 2 && s.invariants.futureOnly === true,
    'status forwards the service status verbatim', s)
  const unknown = await spec.run({ action: 'notify' })
  ok(unknown.ok === false && unknown.code === 'VMU_INVALID_ARGUMENT' && /wait and status/.test(unknown.hint || ''),
    'and an action outside the enum is refused by name with a next step (notify is deliberately NOT a member action)', unknown)
}
{
  // The tool must not validate the interval itself: whatever the kernel decides is what the caller sees.
  const echoed = { ok: true, timedOut: false, clamped: true, timeoutMs: 10000 }
  const spec = makeActivitySpec({ param, refused, TOOL_NAMES: SPEC_NAMES, kernel: { activity: { wait: (a) => Promise.resolve(Object.assign({ received: a.timeoutMs }, echoed)), status: () => ({ ok: true }) } } })
  const r = await spec.run({ action: 'wait', timeout_ms: 1 })
  ok(r.received === 1 && r.clamped === true && r.timeoutMs === 10000,
    'a value below the interval reaches the KERNEL unchanged and only the kernel clamps it (no second policy here)', r)
}
{
  const spec = makeActivitySpec({ param, refused, TOOL_NAMES: SPEC_NAMES, kernel: { activity: null } })
  const r = await spec.run({ action: 'wait', timeout_ms: 10000 })
  ok(r.ok === false && r.code === 'VMU_ENGINE_UNAVAILABLE' && /vmu\.activity/.test(r.hint || ''),
    'an unmounted primitive is a named refusal that names the declaration which would wire it', r)
}
{
  const sync = { code: CODE.invalidTimeout, hint: 'pass a value inside the interval', enforced: ['vmu.activity.timeoutMinMs', 'vmu.activity.timeoutMaxMs'], enforcedScope: 'evaluated-so-far' }
  const spec = makeActivitySpec({ param, refused, TOOL_NAMES: SPEC_NAMES, kernel: { activity: { wait: () => { throw Object.assign(new Error('timeout_ms must be an integer from 10000 through 3600000'), sync) }, status: () => ({ ok: true }) } } })
  const r = await spec.run({ action: 'wait', timeout_ms: 5 })
  ok(r.ok === false && r.code === CODE.invalidTimeout && r.hint === sync.hint,
    'a SYNCHRONOUS kernel refusal reaches the caller with its code and hint', r)
  ok(JSON.stringify(r.enforced) === JSON.stringify(sync.enforced) && r.enforcedScope === 'evaluated-so-far',
    '★ and the evaluated scope survives the face boundary (D3: “why was it refused” keeps naming what was read)', r)
  const asyncSpec = makeActivitySpec({ param, refused, TOOL_NAMES: SPEC_NAMES, kernel: { activity: {
    wait: () => Promise.reject(Object.assign(new Error('the wait was aborted'), { code: CODE.aborted, hint: 'the signal reason is on abortReason', enforced: [] })),
    status: () => ({ ok: true }) } } })
  const a = await asyncSpec.run({ action: 'wait', timeout_ms: 10000 })
  ok(a.ok === false && a.code === CODE.aborted && Array.isArray(a.enforced),
    'an ABORTED wait (a rejected promise) is reported by its named code, never as a crash', a)
}

console.log('=== 2. THE FACE IS REACHABLE BY DECLARATION (and absent without one) ===')
{
  ok(TOOL_NAMES.activity === 'vibe_vmu_wait', 'the published tool name is frozen in TOOL_NAMES', TOOL_NAMES.activity)
  ok(faceKeyOf('activity') === 'activity' && faceKeyOf('vibe_vmu_wait') === 'activity' && faceKeyOf('activityTool') === 'activity',
    'the face resolves by key, by tool name and by the legacy <face>Tool flag', { a: faceKeyOf('activity'), b: faceKeyOf('vibe_vmu_wait'), c: faceKeyOf('activityTool') })
  const row = TOOL_FACES.find((f) => f.face === 'activity')
  ok(!!row && row.name === TOOL_NAMES.activity, 'TOOL_FACES carries the row', row)
  ok(!!row && row.families.includes('vmu.activity.') && row.config.includes('activity'),
    'and it declares BOTH intent paths (the settings family and the preset config key), per D-01', row)
  const k = createKernel({ clock: () => 0, settings: {} })
  const zero = toolSpecs({ kernel: k, settings: {} })
  ok(zero.length === 1 && zero[0].name === TOOL_NAMES.status,
    'with NOTHING declared exactly one tool registers (the zero-mechanism invariant is unchanged)', zero.map((s) => s.name))
  const on = toolSpecs({ kernel: k, settings: { 'vmu.activity.timeoutMs': 30000 } })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.activity),
    'declaring a `vmu.activity.*` key publishes the face (and nothing else)', on.map((s) => s.name))
  const viaConfig = toolSpecs({ kernel: k, settings: {}, config: { activity: { timeoutMs: 20000 } } })
  ok(viaConfig.some((s) => s.name === TOOL_NAMES.activity),
    'and the preset config key declares it too (both documented paths work)', viaConfig.map((s) => s.name))
  const viaFlag = toolSpecs({ kernel: k, settings: {}, activityTool: true })
  ok(viaFlag.some((s) => s.name === TOOL_NAMES.activity), 'the legacy explicit flag still works (per-face unit tests rely on it)', viaFlag.map((s) => s.name))
  const disabled = toolSpecs({ kernel: k, settings: { 'vmu.activity.timeoutMs': 30000, 'vmu.core.facesDisabled': ['activity'] } })
  ok(!disabled.some((s) => s.name === TOOL_NAMES.activity),
    'and vmu.core.facesDisabled turns it off by name (a face is never silently unavailable)', disabled.map((s) => s.name))
}

console.log('=== 3. THE SCHEMA KEYS ARE THE KEYS THE MODULE READS ===')
{
  const byKey = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  const EXPECT = {
    'vmu.activity.timeoutMs': { type: 'natural', def: 30000, hot: 'H1' },
    'vmu.activity.timeoutMinMs': { type: 'natural', def: 10000, hot: 'H1' },
    'vmu.activity.timeoutMaxMs': { type: 'natural', def: 3600000, hot: 'H1' },
    'vmu.activity.timeoutPolicy': { type: 'enum', def: 'refuse', hot: 'H1' },
    'vmu.activity.wakeOn': { type: 'stringList', def: [], hot: 'H2' },
    'vmu.activity.maxWaiters': { type: 'natural', def: 128, hot: 'H1' },
    'vmu.activity.noPeerShortCircuit': { type: 'boolean', def: true, hot: 'H1' },
  }
  ok(ACTIVITY_KEYS.length === 7, 'the module reads seven keys', ACTIVITY_KEYS.length)
  for (const key of ACTIVITY_KEYS) {
    const d = byKey.get(key)
    const want = EXPECT[key]
    ok(!!d, 'declared in settings/schema.js: ' + key, d)
    if (!d || !want) continue
    ok(d.type === want.type && JSON.stringify(d.def) === JSON.stringify(want.def) && d.hot === want.hot && d.who === 'office',
      'and its type/default/hot class/owner match the frozen contract: ' + key, { got: { type: d.type, def: d.def, hot: d.hot, who: d.who }, want })
  }
  ok(byKey.get('vmu.activity.timeoutPolicy').domain.join(',') === 'refuse,clamp',
    'the policy key enumerates exactly the two declared choices (refuse | clamp)', byKey.get('vmu.activity.timeoutPolicy').domain)
  ok(byKey.get('vmu.activity.wakeOn').hot === 'H2',
    '★ wakeOn is H2 (next session) because the bus entry is registered at CONSTRUCTION — the hot class must describe that, not flatter it', byKey.get('vmu.activity.wakeOn').hot)
  // A key declared for this family but unknown to the module would be a silent knob; a key the module reads but the
  // schema does not declare would be a typo that the loader cannot check. Both directions are asserted here.
  const family = SETTING_DEFS.filter((d) => /^vmu\.activity\./.test(d.key)).map((d) => d.key).sort()
  ok(JSON.stringify(family) === JSON.stringify(ACTIVITY_KEYS.slice().sort()),
    'and there is no key in the family that the module does not read (no silent knob either way)', { family, module: ACTIVITY_KEYS })
}

console.log('=== 4. THE ASSEMBLED KERNEL: PEER SHORT-CIRCUIT, A REAL WAKE, A REAL TIMEOUT, THE REGISTRY ===')
{
  // A kernel with NOTHING declared has no roster at all (kernel/index.js:1152-1154), so it has no peer seam either —
  // and the status must SAY SO rather than imply a check happened.
  const bare = createKernel({ clock: () => 0, settings: {} })
  ok(bare.status().members === null && bare.activity.status().peerCheck.seam === false,
    'a bare kernel declares no roster and honestly reports that the peer check is unavailable', bare.activity.status().peerCheck)
  // Declaring a roster cap creates the roster, hence the real peer seam.
  const k = createKernel({ clock: () => 0, settings: { 'vmu.limits.maxLiveMembers': 2 } })
  ok(k.activity && typeof k.activity.wait === 'function' && typeof k.activity.notify === 'function' && typeof k.activity.dispose === 'function',
    'the kernel exposes the service (wait/notify/dispose)', Object.keys(k.activity || {}))
  const st = k.status().activity
  ok(!!st && st.ok === true && st.invariants.futureOnly === true && st.invariants.oneShot === true,
    'and kernel.status() carries its own verdict (the waiting primitive is observable from the status face)', st && st.invariants)
  ok(st.timer.shape === 'global-setTimeout',
    'the assembly reports WHICH timer it uses (the kernel timer option is deliberately not forwarded)', st.timer)
  // v5r parity, measured on the assembled kernel: a roster with nobody else in it returns immediately.
  const np = await k.activity.wait({ timeoutMs: 10000 })
  ok(np.noProgress && np.noProgress.reason === 'no-active-peer' && np.timedOut === false,
    '★ with an empty roster the REAL kernel returns noProgress at once instead of waiting for activity nobody can produce', np)
  ok(k.activity.status().peerCheck.seam === true, 'the member peer seam is really wired once a roster exists', k.activity.status().peerCheck)
  // The tool face reaches the REAL service.
  const specs = toolSpecs({ kernel: k, settings: { 'vmu.activity.timeoutMs': 30000, 'vmu.limits.maxLiveMembers': 2 }, activityTool: true })
  const spec = specs.find((s) => s.name === TOOL_NAMES.activity)
  ok(!!spec, 'the host publishes the activity tool for a declared kernel', specs.map((s) => s.name))
  const sr = await spec.run({ action: 'status' })
  ok(sr.ok === true && sr.invariants && sr.invariants.futureOnly === true,
    'and its status action reaches the assembled service (not a stub)', sr && sr.invariants)
  const wr = await spec.run({ action: 'wait', timeout_ms: 10000 })
  ok(wr.ok === true && wr.noProgress && wr.noProgress.reason === 'no-active-peer',
    'and its wait action forwards the kernel’s noProgress receipt end to end', wr)
}
{
  // A REAL wake through the assembled bus: declare the hook, wait, then let a committed state change happen.
  const settings = { 'vmu.activity.wakeOn': ['chat/sent'], 'vmu.middleware.hookTimeoutMs': 0, 'vmu.activity.noPeerShortCircuit': false }
  const k = createKernel({ clock: () => 0, settings })
  const entry = k.bus.status().entries.find((e) => e.id === WAKE_ENTRY_ID)
  ok(!!entry && JSON.stringify(entry.on) === JSON.stringify(['chat/sent']) && entry.failure === 'open',
    '★ declaring vmu.activity.wakeOn really puts ONE observing entry on the assembled bus', entry)
  // The D-01 interaction, pinned rather than discovered later: a bus entry IS a middleware declaration, so that face lights up.
  const faces = toolSpecs({ kernel: k, settings })
  ok(faces.some((s) => s.name === TOOL_NAMES.middleware),
    'and the middleware face lights up with it (D-01: an entry already on the bus is a declaration too — documented, not a surprise)', faces.map((s) => s.name))
  const p = k.activity.wait({ timeoutMs: 10000, member: 'm1', reason: 'integration' })
  const emitted = await k.bus.emit('chat/sent', { by: 'm2' })
  const r = await p
  ok(r.timedOut === false && r.notified.what === 'hook:chat/sent' && r.notified.seq === 1,
    '★ a real committed hook wakes the waiting member END TO END (ticket: this is what replaces polling)', r.notified)
  ok(emitted.ok === true && emitted.decisions.length === 0,
    'and the wake contributes no decision to the bus (it can never block the write it observes)', emitted.decisions.length)
}
{
  // A REAL timeout through the assembly (a real platform timer, with the bounds declared low so the test stays fast).
  const settings = { 'vmu.activity.noPeerShortCircuit': false, 'vmu.activity.timeoutMinMs': 5, 'vmu.activity.timeoutMaxMs': 60, 'vmu.activity.timeoutMs': 10 }
  const k = createKernel({ clock: () => 0, settings })
  const t0 = Date.now()
  const r = await k.activity.wait({})
  ok(r.timedOut === true && Date.now() - t0 < 5000,
    '★ the assembled kernel really times a wait out (platform timer), it does not hang', { timedOut: r.timedOut, elapsed: Date.now() - t0 })
  ok(k.activity.status().disposersCalled >= 1 && k.activity.status().waiters === 0,
    'and the timeout branch cleaned up: the disposer ran and no waiter is left', k.activity.status().disposersCalled)
}
{
  // The registry entry a pack author looks up (`requires: ['vmu.activity']`).
  const k = createKernel({ clock: () => 0, settings: {} })
  const services = (k.status().registry && k.status().registry.services) || []
  ok(services.some((s) => s.name === 'vmu.activity'),
    '★ vmu.activity is REGISTERED (a service a pack may require must resolve by name, not merely exist as a property)',
    services.filter((s) => /activity/.test(s.name)))
}

console.log('')
console.log('=== VMU ACTIVITY TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
