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
  // PHASE 6 (goal-3 audit P1): an OWNED declaration is RETRACTABLE, and a topic survives while another owner holds it.
  const owned = newBus().declareTopic('lab/owned-topic', { by: 'pack-A' })
  ok(owned.by === 'pack-A' && m.isDeclaredTopic('lab/owned-topic') === true,
    'an owned declaration is visible while its owner holds it', JSON.stringify(owned))
  newBus().declareTopic('lab/owned-topic', { by: 'pack-B' })
  const dropA = newBus().retractTopic('lab/owned-topic', { by: 'pack-A' })
  ok(dropA.removed === true && dropA.stillDeclared === true && m.isDeclaredTopic('lab/owned-topic') === true,
    'retracting ONE owner keeps the topic (pack B still holds it)', JSON.stringify(dropA))
  const dropAll = newBus().retractTopicsOwnedBy('pack-B')
  ok(dropAll.count === 1 && m.isDeclaredTopic('lab/owned-topic') === false,
    'retracting the LAST owner drops the topic from the declared set - an unload leaves no topic behind', JSON.stringify(dropAll))
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
  // ★ REMOVED `ok(true, ...)`: the claim is that a bridged host hook name is ACCEPTED, which means the emit
  // must not throw. Awaiting it and requiring no throw is the assertion; a literal `true` asserted nothing.
  let bridgeEmitError = null
  try { await bridge.emit('agent/created', {}, { bridge: true }) } catch (e) { bridgeEmitError = e }
  ok(bridgeEmitError === null, 'bridged host hook names are accepted (the substrate bridge must not be refused)', bridgeEmitError && String(bridgeEmitError.message))

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


// ── ROUND 295: the three declared entry defaults (volume 05 §L77/§L81/§L63) ──────────────────────────────────
{
  const e = (extra) => Object.assign({ id: 'md-' + Math.random().toString(36).slice(2, 8), kind: 'rules', on: 'before-write', handler: () => true }, extra || {})
  const b = m.createBus({ entries: [e()], settings: {} }).status().entries[0]
  ok(b.enabled === true && b.order === 1000 && b.failure === 'closed',
    'middleware defaults: an entry that declares none gets enabled/1000/closed', JSON.stringify(b))
  const declared = m.createBus({ entries: [e()], settings: { 'vmu.middleware.enabled': false, 'vmu.middleware.order': 7, 'vmu.middleware.onFailure': 'open' } }).status().entries[0]
  ok(declared.enabled === false && declared.order === 7 && declared.failure === 'open',
    'middleware declarations: the declared defaults replace the built-in ones', JSON.stringify(declared))
  const own = m.createBus({ entries: [e({ enabled: true, order: 3, failure: 'closed' })],
    settings: { 'vmu.middleware.enabled': false, 'vmu.middleware.order': 7, 'vmu.middleware.onFailure': 'open' } }).status().entries[0]
  ok(own.enabled === true && own.order === 3 && own.failure === 'closed',
    'the ENTRY wins over every declared default - the keys only fill gaps', JSON.stringify(own))
}

// ── PHASE 6: the registry's `blockable` flag must be TRUE only where a consumer honours a deny ───────────────
{
  const row = (name) => m.HOOK_REGISTRY.find((h) => h.name === name) || null
  // These four USED to claim blockable:true while their only consumer ignored the receipt. They are now honest
  // (observation-only), and the reason lives next to each row in kernel/bus.js.
  const observationOnly = ['budget/exceeded', 'human/gate-pending', 'agent/pre-step', 'fs/write-intent']
  const stillClaimed = observationOnly.filter((n) => { const r = row(n); return !r || r.blockable !== false })
  ok(stillClaimed.length === 0,
    '★ observation-only hooks do NOT claim blockable (a registry that promises a veto nobody implements is a lie)',
    stillClaimed)
  // And the hooks whose consumers DO honour the receipt are still blockable (the fix did not downgrade reality).
  const enforced = ['ballot/tally', 'ballot/cast', 'task/assign', 'task/transition', 'settle/before', 'pack/loading', 'tools/pre-execute']
  const lost = enforced.filter((n) => { const r = row(n); return !r || r.blockable !== true })
  ok(lost.length === 0, '★ hooks with a real refusing consumer remain blockable:true', lost)
}

// ── RE-ENTRANT EMIT OF THE SAME HOOK IS REFUSED BY NAME (and nesting a DIFFERENT hook still works) ───────────
// ★ MEASURED before the guard existed: an entry hooked on a hook that emitted THAT SAME hook from inside its own
// handler re-entered the bus — a probe reached 31 nested invocations and was still going, and only the probe's own
// cap stopped it — while the receipt still said ok:true, decisions:0. `vmu.turn` carries `VMU_TURN_REENTRANT` for
// the same hazard; the bus, reachable as `vmu.middleware` by any module holding `trigger-workflow`, had no guard.
{
  const b = m.createBus ? m.createBus({ log: () => {} }) : null
  ok(b !== null, '★ the bus is constructible for the re-entrancy checks', b === null)
  if (b) {
    // 反：同一钩子在自己 handler 内 emit 自身 ⇒ 具名拒，且 handler 只跑一次（旧行为：无限嵌套）
    let sameRuns = 0
    let sameCode = null
    b.on({ id: 'reent-same', kind: 'module', order: 10, on: ['control/idle'], failure: 'open', capabilities: ['read-args'], scope: ['member'] },
      async () => { sameRuns += 1; try { await b.emit('control/idle', { nested: true }) } catch (e) { sameCode = e && e.code } return undefined })
    const outer = await b.emit('control/idle', { first: true })
    ok(sameCode === 'VMU_MIDDLEWARE_REENTRANT' && sameRuns === 1 && outer && outer.ok === true,
      '★ 反：同一钩子重入 ⇒ VMU_MIDDLEWARE_REENTRANT，handler 只跑一次（外层被 failure:open 吸收，这是有意的失败策略语义）',
      { sameCode, sameRuns, outerOk: outer && outer.ok })
    // 正：不同钩子嵌套是合法的（v5r stall-meeting 的路径）
    let crossOk = null
    let crossRuns = 0
    b.on({ id: 'reent-cross', kind: 'module', order: 10, on: ['meeting/motion'], failure: 'open', capabilities: ['read-args'], scope: ['member'] },
      async () => { crossRuns += 1; try { const r = await b.emit('control/idle', { from: 'cross' }); crossOk = r && r.ok } catch (e) { crossOk = 'THREW ' + (e && e.code) } return undefined })
    const outer2 = await b.emit('meeting/motion', {})
    ok(crossOk === true && outer2 && outer2.ok === true,
      '★ 正：嵌套【不同】钩子仍允许（拒绝一刀切嵌套会打断已在使用中的模式）', { crossOk, outer2Ok: outer2 && outer2.ok })
    // 正：守卫在每条路径上释放（否则下一次合法 emit 会被误拒 —— 比它修的 bug 更糟）
    const outer3 = await b.emit('meeting/motion', {})
    ok(outer3 && outer3.ok === true && crossRuns === 2,
      '★ 正：守卫在每条路径上释放 —— 下一次合法 emit 仍能跑', { outer3Ok: outer3 && outer3.ok, crossRuns })
    // ★★ 正：两次【并发】的同钩子 emit（第二次不等第一次 await）是两个独立事件，不是递归 —— 必须允许。
    // 这条是被 `vmu-metrics-counter` 抓出来的：模块级 Set 会拒掉第二次，把合法并发误判成递归。
    {
      const b2 = m.createBus({ log: () => {} })
      let runs = 0
      b2.on({ id: 'concurrent', kind: 'module', order: 10, on: ['math/job-settled'], failure: 'open', capabilities: ['read-args'], scope: ['member'] },
        async () => { runs += 1; return undefined })
      const pa = b2.emit('math/job-settled', { jobId: 'j-1', engine: 'probe' })
      const pb = b2.emit('math/job-settled', { jobId: 'j-2', engine: 'probe' })
      const [ra, rb] = await Promise.all([pa, pb])
      ok(runs === 2 && ra && ra.ok === true && rb && rb.ok === true,
        '★★ 正：同钩子的两次【并发】emit 都执行（并发 ≠ 重入 —— 守卫必须按异步链而不是全局判）', { runs, raOk: ra && ra.ok, rbOk: rb && rb.ok })
    }
  }
}

// ── AN ENTRY THAT ACTS BY SIDE EFFECT IS VISIBLE: ran counts it, decisions does not ─────────────────────────
// ★ MEASURED on a live host: a stall policy hooked on `control/idle` convened a meeting, the beat receipt said
// `emitted: true` — and `middleware: 0`, because the receipt counted DECISIONS and a policy that acts by side effect
// (trigger-workflow / record / notify) returns nothing. `ran` now reports the invocations so the difference is visible.
{
  const bs = m.createBus({ log: () => {} })
  bs.on({ id: 'side-effect-only', kind: 'module', order: 10, on: ['control/idle'], failure: 'open', capabilities: ['read-args'], scope: ['member'] },
    async () => undefined)
  const rs = await bs.emit('control/idle', {})
  ok(rs && rs.ran === 1 && Array.isArray(rs.decisions) && rs.decisions.length === 0,
    '★★ 副作用型条目：ran=1 而 decisions=0（回执可以区分"跑了但没返回决策"与"什么都没跑"）', { ran: rs && rs.ran, decisions: rs && rs.decisions && rs.decisions.length })
  const tr = bs.trace(rs.traceId) || []
  ok(tr.length === 1 && tr[0].outcome === 'observed' && tr[0].entry === 'side-effect-only',
    '★★ 且 trace 里有 observed 行（旧行为：它一行都不留 —— trace 对副作用型中间件完全盲）', tr.map((x) => x.outcome))
  // 对照：没有任何条目的钩子 ⇒ ran=0（不是恒为 1）
  const rs2 = await bs.emit('meeting/motion', {})
  ok(rs2 && rs2.ran === 0 && rs2.decisions.length === 0,
    '★ 对照：没有条目匹配的钩子 ⇒ ran=0（ran 不是恒同值）', { ran: rs2 && rs2.ran })
}
console.log('=== VMU BUS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
