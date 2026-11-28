import test from 'node:test'
import assert from 'node:assert/strict'

const load = () => import('../shared/subagent-compat.js')
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(overrides = {}) {
  const effects = [], warnings = [], starts = [], depthArgs = []
  const pending = deferred()
  let disposed = 0
  const receipt = { childId: 'child-1', messageId: 'message-1', result: pending.promise,
    async dispose() { disposed++ } }
  const raw = {
    resolveMaxDepth(value) { depthArgs.push(value); return value === undefined ? 2 : value },
    async startActivation(spec) { starts.push(spec); return receipt },
    ...overrides,
  }
  const ctx = { subagents: raw,
    effect(fn) { const dispose = fn(); effects.push(dispose); return dispose },
    logger: { warn(message) { warnings.push(message) } },
  }
  const parent = { id: 'root-1' }
  const spec = { provider: 'spawn', label: 'solver', signal: new AbortController().signal,
    request: { parent, prompt: [{ type: 'text', text: 'prove a finite claim' }],
      cwd: 'relative-workspace', agentOptions: { model: 'model-a' } } }
  return { ctx, raw, spec, parent, starts, depthArgs, effects, warnings, pending, receipt,
    get disposed() { return disposed } }
}

test('legacy start remains an identity-preserving call on the real service', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  f.spec.request.toolFilter = { deny: ['write'] }
  const result = { childId: 'legacy-child' }
  f.raw.startContinuable = async function (spec) {
    assert.equal(this, f.raw)
    assert.equal(spec, f.spec)
    return result
  }
  assert.equal(await startContinuable(f.ctx, f.spec), result)
  assert.equal(f.starts.length, 0)
  assert.equal(f.effects.length, 0)
})

test('modern activation preserves parent/prompt identity and resolves configured host depth', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  const result = await startContinuable(f.ctx, f.spec)
  const actual = f.starts[0]
  assert.equal(result, f.receipt)
  assert.equal(actual.request.parent, f.parent)
  assert.equal(actual.request.prompt, f.spec.request.prompt)
  assert.equal(actual.request.agentOptions, f.spec.request.agentOptions)
  assert.notEqual(actual.signal, f.spec.signal, 'host admission has its own cancellation scope')
  assert.equal(actual.signal.aborted, false)
  assert.equal(actual.provider, 'spawn')
  assert.equal(actual.label, 'solver')
  assert.equal(actual.delivery, 'caller')
  assert.equal(actual.request.cwd, 'relative-workspace')
  assert.equal(actual.request.maxDepth, 2)
  assert.deepEqual(f.depthArgs, [undefined])
  assert.equal(f.spec.request.maxDepth, undefined, 'caller-owned request is not mutated')
  f.pending.resolve({ stopReason: 'completed', output: [] })
})

test('explicit depth passes through resolver and provider-managed undefined stays undefined', async () => {
  const { startContinuable } = await load()
  const explicit = fixture()
  explicit.spec.request.maxDepth = 3
  await startContinuable(explicit.ctx, explicit.spec)
  assert.deepEqual(explicit.depthArgs, [3])
  assert.equal(explicit.starts[0].request.maxDepth, 3)
  const managed = fixture({ resolveMaxDepth() { return undefined } })
  await startContinuable(managed.ctx, managed.spec)
  assert.equal(managed.starts[0].request.maxDepth, undefined)
  explicit.pending.resolve({}); managed.pending.resolve({})
})

test('missing depth resolver is reported before starting a potentially unbounded child', async () => {
  const { startContinuable } = await load()
  const f = fixture({ resolveMaxDepth: undefined })
  await assert.rejects(startContinuable(f.ctx, f.spec), { code: 'VIBE_MATH_UNSUPPORTED_CAPABILITY' })
  assert.equal(f.starts.length, 0)
})

test('modern toolFilter and persona are rejected explicitly rather than silently discarded', async () => {
  const { startContinuable } = await load()
  for (const [field, value] of [['toolFilter', { deny: ['write'] }], ['persona', 'research identity']]) {
    const f = fixture()
    f.spec.request[field] = value
    await assert.rejects(startContinuable(f.ctx, f.spec), error => {
      assert.equal(error.code, 'VIBE_MATH_UNSUPPORTED_CAPABILITY')
      assert.match(error.message, new RegExp(field))
      return true
    })
    assert.equal(f.starts.length, 0)
  }
})

test('admission failures preserve the original exception and never fabricate success', async () => {
  const { startContinuable } = await load()
  const failure = Object.assign(new Error('provider unavailable'), { code: 'NO_PROVIDER' })
  const f = fixture({ async startActivation() { throw failure } })
  await assert.rejects(startContinuable(f.ctx, f.spec), error => error === failure)
  await f.effects[0]()
  assert.equal(f.disposed, 0)
})

test('a rejected result is observed, logged and removed without synthetic lifecycle events', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  await startContinuable(f.ctx, f.spec)
  f.pending.reject(new Error('backend failed'))
  await tick()
  assert.equal(f.warnings.length, 1)
  assert.match(f.warnings[0], /child-1.*backend failed/)
  await f.effects[0]()
  assert.equal(f.disposed, 0)
})

test('plugin disposal releases every active receipt once and reports cleanup failures', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  await startContinuable(f.ctx, f.spec)
  await f.effects[0]()
  await f.effects[0]()
  assert.equal(f.disposed, 1)
  await assert.rejects(startContinuable(f.ctx, f.spec), { code: 'VIBE_MATH_CONTEXT_DISPOSED' })
  assert.equal(f.starts.length, 1)
  const bad = fixture()
  bad.receipt.dispose = async () => { throw new Error('cleanup failure') }
  await startContinuable(bad.ctx, bad.spec)
  await assert.rejects(bad.effects[0](), /cleanup failure/)
})

test('normal completion needs no second dispose and does not emit duplicate end events', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  f.ctx.emit = () => assert.fail('native lifecycle must not be synthesized')
  await startContinuable(f.ctx, f.spec)
  f.pending.resolve({ stopReason: 'completed', output: [] })
  await tick()
  await f.effects[0]()
  assert.equal(f.disposed, 0)
})

test('startup timeout does not become a lifetime cancellation timer after admission', async () => {
  const { startContinuable } = await load()
  const f = fixture(), controller = new AbortController()
  f.spec.signal = controller.signal
  await startContinuable(f.ctx, f.spec)
  controller.abort(new Error('admission timeout elapsed'))
  await tick()
  assert.equal(f.starts[0].signal.aborted, false, 'admitted child is detached from the startup timeout signal')
  assert.equal(f.disposed, 0)
  await f.effects[0]()
  assert.equal(f.disposed, 1)
})

test('disposal during pending admission releases its late receipt and returns a named error', async () => {
  const { startContinuable } = await load()
  const gate = deferred()
  const f = fixture({ async startActivation() { return gate.promise } })
  const startup = startContinuable(f.ctx, f.spec)
  const cleanup = f.effects[0]()
  gate.resolve(f.receipt)
  await assert.rejects(startup, { code: 'VIBE_MATH_CONTEXT_DISPOSED' })
  await cleanup
  assert.equal(f.disposed, 1)
})

test('receipts are scoped to activation epochs when a durable child id is reused', async () => {
  const { startContinuable } = await load()
  const f = fixture(), second = deferred()
  let disposedSecond = 0
  await startContinuable(f.ctx, f.spec)
  f.raw.startActivation = async () => ({ childId: 'child-1', result: second.promise,
    async dispose() { disposedSecond++ } })
  await startContinuable(f.ctx, f.spec)
  f.pending.resolve({ stopReason: 'completed' })
  await tick()
  await f.effects[0]()
  assert.equal(f.disposed, 0)
  assert.equal(disposedSecond, 1)
})

test('a synchronous receipt cleanup failure does not strand other active children', async () => {
  const { startContinuable } = await load()
  const f = fixture(), other = deferred()
  let otherDisposed = 0
  f.receipt.dispose = () => { throw new Error('synchronous cleanup failure') }
  await startContinuable(f.ctx, f.spec)
  f.raw.startActivation = async () => ({ childId: 'child-2', result: other.promise,
    async dispose() { otherDisposed++ } })
  await startContinuable(f.ctx, f.spec)
  let cleanupError
  try { await f.effects[0]() } catch (error) { cleanupError = error }
  assert.equal(otherDisposed, 1, 'every admitted child receives cleanup even if another disposer throws synchronously')
  assert.ok(cleanupError instanceof AggregateError)
  assert.match(String(cleanupError.errors[0]), /synchronous cleanup failure/)
})

test('lifecycle claims preserve simultaneous roots and exact early start/end identity without re-emitting', async () => {
  const { createChildLifecycle } = await load()
  const f = fixture(), owner = new Set(), agents = new Map(), seen = [], admissions = new Map()
  f.ctx.agents = { get(id) { return agents.get(id) } }
  f.ctx.emit = () => assert.fail('native events must never be re-emitted')
  const gate = createChildLifecycle(f.ctx, { owns: id => owner.has(id),
    start(info, agent) { seen.push(['start', info.id, agent]) },
    end(info) { seen.push(['end', info.id, info.lastAssistantMessage]) } })
  f.raw.startActivation = async spec => {
    const id = spec.request.parent.id === 'root-A' ? 'child-A' : 'child-B'
    const agent = { id, session: { header: { parentSession: spec.request.parent.id } } }
    const end = { id, runId: 'epoch-' + id, lastAssistantMessage: [{ type: 'text', text: id + '-reply' }] }
    agents.set(id, agent); gate.startEvent({ id, runId: end.runId }); agents.delete(id)
    gate.endEvent(end); gate.endEvent(end)
    const admitted = deferred(); admissions.set(id, { admitted, agent, end })
    return admitted.promise
  }
  const a = gate.start({ ...f.spec, request: { ...f.spec.request, parent: { id: 'root-A' } } })
  const b = gate.start({ ...f.spec, request: { ...f.spec.request, parent: { id: 'root-B' } } })
  gate.endEvent({ id: 'unrelated-child', lastAssistantMessage: [] })
  const admitted = id => ({ childId: id, result: new Promise(() => {}), async dispose() {} })
  admissions.get('child-B').admitted.resolve(admitted('child-B')); const rb = await b
  owner.add(rb.childId); gate.claim(rb.childId)
  assert.deepEqual(seen, [['start', 'child-B', admissions.get('child-B').agent], ['end', 'child-B', admissions.get('child-B').end.lastAssistantMessage]])
  admissions.get('child-A').admitted.resolve(admitted('child-A')); const ra = await a
  owner.add(ra.childId); gate.claim(ra.childId); gate.claim(ra.childId); gate.claim('unrelated-child')
  assert.deepEqual(seen.map(x => x.slice(0, 2)), [['start', 'child-B'], ['end', 'child-B'], ['start', 'child-A'], ['end', 'child-A']])
  for (const dispose of f.effects.toReversed()) await dispose()
})

test('lifecycle gate drops buffered events after admission rejection and context disposal', async () => {
  const { createChildLifecycle } = await load()
  const f = fixture(), seen = [], agent = { id: 'rejected-child' }
  f.ctx.agents = { get() { return agent } }
  const gate = createChildLifecycle(f.ctx, { owns: () => false, start(info) { seen.push(info) }, end(info) { seen.push(info) } })
  f.raw.startActivation = async () => { gate.startEvent({ id: agent.id }); gate.endEvent({ id: agent.id }); throw new Error('admission rejected') }
  await assert.rejects(gate.start(f.spec), /admission rejected/)
  gate.claim(agent.id)
  assert.deepEqual(seen, [], 'a rejected admission does not acquire a lifecycle owner')
  const admit = deferred()
  f.raw.startActivation = async () => { gate.startEvent({ id: 'late-child' }); gate.endEvent({ id: 'late-child' }); return admit.promise }
  const starting = gate.start(f.spec)
  const cleanup = Promise.all(f.effects.toReversed().map(dispose => dispose()))
  admit.resolve(f.receipt)
  await assert.rejects(starting, { code: 'VIBE_MATH_CONTEXT_DISPOSED' })
  await cleanup
  gate.claim('late-child'); gate.startEvent({ id: 'late-child' }); gate.endEvent({ id: 'late-child' })
  assert.deepEqual(seen, [], 'disposed gate retains and dispatches no pending native event')
  assert.equal(f.disposed, 1, 'late receipt still gets exact ownership cleanup')
})
