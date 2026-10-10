// vmu bus — the capability scenario for kernel/bus.js (docs/05).
//
// What must hold (docs/05 §12):
//   · entries are validated statically and duplicate ids are a conflict, never a silent override;
//   · ordering is deterministic (order, then id) so the same configuration behaves identically;
//   · deny/cancel are terminal and named; the refusal carries the offending entry id;
//   · failures are three-state and every failure is audited: open continues, closed refuses,
//     abort reports an abort to the caller;
//   · consecutive failures trip a breaker that disables the entry (and status says why);
//   · an entry may only use capabilities it declared — otherwise the operation is refused, audited
//     and counted, because that is a defect rather than a policy;
//   · dry-run reports decisions without applying them;
//   · every decision is traceable through one traceId;
//   · `wrapHostWaterfall` owns the host contract: a handler that returns undefined MUST let the chain
//     continue (a DSH waterfall silently vetoes everything otherwise).
//
// `--self-probe` replaces the wrapper with one that forgets to call next(): the assertion that the
// chain continues must then FAIL, which proves the check can catch the veto bug it exists for.

import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SELF_PROBE = process.argv.includes('--self-probe')

const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'bus.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = (fn, code, name) => {
  try { fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const auditRows = []
const newBus = (settings = {}) => m.createBus({ settings, onAudit: (r) => auditRows.push(r) })

// ---- 1. static validation and conflicts --------------------------------------------------------
{
  const bus = newBus()
  expectThrow(() => bus.add({ id: 'x', kind: 'nope', on: ['meeting/round-start'] }), 'VMU_MIDDLEWARE_FAILED', 'unknown kind refused')
  expectThrow(() => bus.add({ id: 'x', kind: 'rules', on: [] }), 'VMU_MIDDLEWARE_FAILED', 'an entry with no hook refused')
  expectThrow(() => bus.add({ id: 'x', kind: 'rules', on: ['meeting/round-start'], failure: 'maybe' }), 'VMU_MIDDLEWARE_FAILED', 'unknown failure policy refused')
  expectThrow(() => bus.add({ id: 'x', kind: 'rules', on: ['meeting/round-start'], order: 1.5 }), 'VMU_MIDDLEWARE_FAILED', 'non-integer order refused')
  expectThrow(() => bus.add({ id: 'x', kind: 'rules', on: ['meeting/round-start'], capabilities: ['fly'] }), 'VMU_MIDDLEWARE_FAILED', 'unknown capability refused')
  bus.add({ id: 'dup', kind: 'rules', on: ['meeting/round-start'] })
  expectThrow(() => bus.add({ id: 'dup', kind: 'rules', on: ['meeting/round-start'] }), 'VMU_MIDDLEWARE_FAILED',
    'duplicate id is a conflict, never a silent override')
}

// ---- 2. deterministic ordering, enable flag, scope ---------------------------------------------
{
  const bus = newBus()
  const order = []
  bus.on({ id: 'b', kind: 'module', on: ['meeting/round-start'], order: 200, capabilities: ['annotate'] }, () => { order.push('b'); return { annotate: {} } })
  bus.on({ id: 'a', kind: 'module', on: ['meeting/round-start'], order: 100, capabilities: ['annotate'] }, () => { order.push('a'); return { annotate: {} } })
  bus.on({ id: 'c', kind: 'module', on: ['meeting/round-start'], order: 100, capabilities: ['annotate'] }, () => { order.push('c'); return { annotate: {} } })
  bus.on({ id: 'off', kind: 'module', enabled: false, on: ['meeting/round-start'], capabilities: ['annotate'] }, () => { order.push('off'); return { annotate: {} } })
  bus.on({ id: 'scoped', kind: 'module', on: ['meeting/round-start'], scope: { role: 'chair' }, capabilities: ['annotate'] },
    () => { order.push('scoped'); return { annotate: {} } })
  await bus.emit('meeting/round-start', {}, { member: 'm-1', role: 'reviewer', phase: 'review' })
  ok(order.join(',') === 'a,c,b', 'order then id, disabled skipped, scope filtered', order.join(','))
  order.length = 0
  await bus.emit('meeting/round-start', {}, { member: 'm-1', role: 'chair', phase: 'review' })
  ok(order.join(',') === 'a,c,b,scoped', 'a scoped entry runs for its role', order.join(','))
}

// ---- 3. deny / cancel are terminal and named ---------------------------------------------------
{
  const bus = newBus()
  const ran = []
  bus.on({ id: 'gate', kind: 'module', on: ['meeting/round-start'], order: 1500, capabilities: ['deny'] },
    () => { ran.push('gate'); return { deny: { code: 'VMU_MEETING_TOO_SMALL', message: 'too few', hint: 'invite more' } } })
  bus.on({ id: 'early', kind: 'module', on: ['meeting/round-start'], order: 100, capabilities: ['annotate'] },
    () => { ran.push('early'); return { annotate: {} } })
  bus.on({ id: 'late', kind: 'module', on: ['meeting/round-start'], order: 2000, capabilities: ['annotate'] },
    () => { ran.push('late'); return { annotate: {} } })
  const r = await bus.emit('meeting/round-start', {})
  ok(r.ok === false && r.refused.code === 'VMU_MEETING_TOO_SMALL' && r.entry === 'gate', 'deny is terminal and named', JSON.stringify(r.refused))
  ok(r.refused.hint === 'invite more', 'the refusal keeps its hint')
  ok(ran.join(',') === 'early,gate', 'entries before the refusal run; entries after it never do', ran.join(','))
  ok(r.decisions.length === 2 && r.decisions.some((d) => d.id === 'gate' && d.decision.deny),
    'the refusal itself is recorded as an applied decision')

  const bus2 = newBus()
  bus2.on({ id: 'stop', kind: 'module', on: ['meeting/round-start'], capabilities: ['cancel'] }, () => ({ cancel: { reason: 'internal short circuit' } }))
  const r2 = await bus2.emit('meeting/round-start', {})
  ok(r2.ok === false && r2.refused.code === 'VMU_MIDDLEWARE_REJECTED', 'cancel refuses with the middleware code')
}

// ---- 4. capability violations are defects ------------------------------------------------------
{
  const bus = newBus()
  bus.on({ id: 'sneaky', kind: 'module', on: ['meeting/round-start'], capabilities: ['annotate'] }, () => ({ deny: { message: 'nope' } }))
  const r = await bus.emit('meeting/round-start', {})
  ok(r.ok === false && /without declaring it/.test(r.message), 'using an undeclared capability refuses the operation', r.message)
  ok(auditRows.some((row) => row.what === 'middleware/failed' && row.id === 'sneaky'), 'the violation is audited')
}

// ---- 5. failure policies: open / closed / abort -----------------------------------------------
{
  const boom = () => { const e = new Error('boom'); e.code = 'VMU_STORE_FAILED'; throw e }

  const open = newBus()
  open.on({ id: 'o', kind: 'module', on: ['record/appended'], failure: 'open', capabilities: ['annotate'] }, boom)
  const ro = await open.emit('record/appended', {})
  ok(ro.ok === true, 'open: a failing entry lets the operation continue')
  ok(auditRows.some((r) => r.what === 'middleware/failure-policy' && r.policy === 'open'), 'open failures are audited with the policy')

  const closed = newBus()
  closed.on({ id: 'c', kind: 'module', on: ['record/append-before'], failure: 'closed', capabilities: ['annotate'] }, boom)
  const rc = await closed.emit('record/append-before', {})
  ok(rc.ok === false && rc.code === 'VMU_MIDDLEWARE_FAILED' && rc.entry === 'c', 'closed: the operation is refused and names the entry')

  const abort = newBus()
  abort.on({ id: 'a', kind: 'module', on: ['budget/exceeded'], failure: 'abort', capabilities: ['annotate'] }, boom)
  const ra = await abort.emit('budget/exceeded', {})
  ok(ra.ok === false && ra.aborted === true && ra.code === 'VMU_STORE_FAILED', 'abort: reported to the caller with the original code')

  const dflt = newBus()
  dflt.on({ id: 'd', kind: 'module', on: ['record/appended'], capabilities: ['annotate'] }, boom)
  const rd = await dflt.emit('record/appended', {})
  ok(rd.ok === true, 'the hook default policy applies when the entry omits one (record/appended = open)')
}

// ---- 6. the breaker disables, and status explains ----------------------------------------------
{
  const bus = newBus({ 'vmu.middleware.breakerThreshold': 3 })
  bus.on({ id: 'leaky', kind: 'module', on: ['record/appended'], failure: 'open', capabilities: ['annotate'] },
    () => { throw new Error('always') })
  for (let i = 0; i < 3; i++) await bus.emit('record/appended', {})
  const st = bus.status()
  const row = st.entries.find((e) => e.id === 'leaky')
  ok(row.enabled === false && /breaker/.test(row.disabledReason || ''), 'three consecutive failures trip the breaker', JSON.stringify(row))
  ok(auditRows.some((r) => r.what === 'middleware/breaker-tripped'), 'tripping the breaker is audited')
  ok(bus.enable('leaky').disabled === false, 'an operator can re-enable a tripped entry')
}

// ---- 7. the hook budget ------------------------------------------------------------------------
{
  const bus = newBus({ 'vmu.middleware.hookTimeoutMs': 20 })
  bus.on({ id: 'slow', kind: 'module', on: ['record/append-before'], failure: 'closed', capabilities: ['annotate'] },
    () => new Promise((res) => setTimeout(() => res({ annotate: {} }), 60)))
  const r = await bus.emit('record/append-before', {})
  ok(r.ok === false && /budget/.test(r.message), 'a handler over budget is stopped by policy', r.message)
  await new Promise((res) => setTimeout(res, 80)) // let the abandoned handler settle before exit
}

// ---- 8. dry-run and trace ----------------------------------------------------------------------
{
  const bus = newBus()
  let sideEffect = false
  bus.on({ id: 'dry', kind: 'module', on: ['record/appended'], capabilities: ['record'] },
    () => { sideEffect = true; return { record: { track: 'routes' } } })
  bus.setDryRun(true)
  const r = await bus.emit('record/appended', {}, { traceId: 'trace-1' })
  ok(r.ok === true && r.decisions[0].decision.dryRun === true, 'dry-run marks decisions instead of applying them')
  ok(bus.isDryRun() === true && bus.status().dryRun === true, 'dry-run state is observable')
  const t = bus.trace('trace-1')
  ok(t.length === 1 && t[0].entry === 'dry' && t[0].outcome === 'decided', 'the decision is traceable by traceId', JSON.stringify(t))
  ok(sideEffect === true, 'the handler still ran (dry-run is about effects, not about skipping the handler)')
}

// ---- 9. the host-waterfall contract ------------------------------------------------------------
{
  const bus = newBus()
  let continued = 0
  bus.on({ id: 'pass', kind: 'module', on: ['host/waterfall'], capabilities: ['annotate'] }, () => undefined)
  const wrapper = SELF_PROBE
    ? async () => ({ ok: true }) // deliberately forgets next(): the DSH veto bug
    : bus.wrapHostWaterfall(async () => { continued++; return 'host-result' })
  const out = await wrapper({ hook: 'host/waterfall' })
  ok(continued === 1 && out === 'host-result', 'a handler that returns undefined lets the host chain continue')
  ok(bus.status().entries[0].hits === 0, 'a passing handler records no hit')

  const bus2 = newBus()
  bus2.on({ id: 'veto', kind: 'module', on: ['host/waterfall'], capabilities: ['deny'] }, () => ({ deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }))
  let secondRan = false
  const wrapped2 = bus2.wrapHostWaterfall(async () => { secondRan = true })
  const out2 = await wrapped2({ hook: 'host/waterfall' })
  ok(out2.ok === false && secondRan === false, 'a refusing handler stops the host chain')
}

// ---- 10. hook-name membership: an unknown name is refused by name (task-40 finding) --------------
{
  const bus = newBus()
  let refused = null
  try { await bus.emit('prompt/assemble', {}) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_INVALID_ARGUMENT',
    'an emit name outside the frozen set is refused by name (it used to reach no listener silently)', refused && refused.code)
  ok(refused && typeof refused.hint === 'string' && /declareTopic/.test(refused.hint),
    'and the hint names the extension point', refused && refused.hint)

  let ran = 0
  bus.on({ id: 'watch-assembly', kind: 'module', on: ['prompt/section-assembled'], capabilities: ['annotate'] },
    () => { ran++; return undefined })
  const good = await bus.emit('prompt/section-assembled', {})
  ok(good.ok === true && ran === 1, 'the FROZEN assembly hook name reaches its entry', 'ran=' + ran)

  const dec = bus.declareTopic('lab/review-requested')
  ok(dec.ok === true && dec.existing === false, 'a NEW topic can be declared (zero mechanism)', JSON.stringify(dec))
  ok(bus.declareTopic('lab/review-requested').existing === true,
    'declaring it twice reports "existing" instead of failing')
  let seen = 0
  bus.on({ id: 'lab-watch', kind: 'module', on: ['lab/review-requested'], capabilities: ['annotate'] },
    () => { seen++; return undefined })
  await bus.emit('lab/review-requested', {})
  ok(seen === 1, 'the declared topic is emittable', 'seen=' + seen)

  let badTopic = null
  try { bus.declareTopic('NotATopic') } catch (e) { badTopic = e }
  ok(badTopic && badTopic.code === 'VMU_INVALID_ARGUMENT', 'a malformed topic is refused by name', badTopic && badTopic.code)

  // The host-waterfall BRIDGE forwards the host's OWN hook names, so it is exempt on purpose.
  const bridge = newBus()
  await bridge.emit('agent/created', {}, { bridge: true })
  ok(true, 'bridged host hook names are accepted (the substrate bridge must not be refused)')

  // NAMESPACE-AWARE validity: a FOREIGN namespace belongs to the substrate and is passed through WITHOUT the
  // bridge flag, while VMU's own namespaces stay closed (that asymmetry is what keeps `prompt/assemble` - a host
  // name that collides with vmu's `prompt/` namespace - refused, which is the drift this check exists for).
  let foreign = null
  try { await bridge.emit('tools/pre-execute', { tool: 'x' }) } catch (e) { foreign = e }
  ok(foreign === null, 'a foreign-namespace hook (host vocabulary) passes through without the bridge flag',
    foreign && foreign.message)
  let stillRefused = null
  try { await bridge.emit('prompt/assemble', {}) } catch (e) { stillRefused = e }
  ok(stillRefused && stillRefused.code === 'VMU_INVALID_ARGUMENT',
    'and a host name that collides with vmu\'s own namespace is STILL refused (the drift guard survives)',
    stillRefused && stillRefused.code)
}

// ---- 11. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  ok(failed > 0, 'self-probe: the wrapper that forgets next() was caught by the chain assertion', failed)
  console.log('=== VMU BUS SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU BUS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
