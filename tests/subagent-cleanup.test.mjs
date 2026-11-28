import test from 'node:test'
import assert from 'node:assert/strict'

const load = () => import('../shared/subagent-compat.js')
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  const effects = [], starts = [], drains = [], messages = []
  const residents = new Map()
  let nextId = 0
  const raw = {
    resolveMaxDepth(value) { return value === undefined ? 2 : value },
    async startActivation(spec) {
      const childId = spec.label + '-' + (++nextId)
      const result = deferred()
      const epoch = { childId, parent: spec.request.parent, active: true, number: 1 }
      residents.set(childId, epoch)
      const receipt = {
        childId,
        result: result.promise,
        disposeCalls: 0,
        async dispose() {
          this.disposeCalls++
          // A native receipt belongs to this exact epoch, not a later cold resume.
          if (residents.get(childId) === epoch) epoch.active = false
        },
      }
      starts.push({ spec, epoch, receipt, result })
      return receipt
    },
    async sendMessage(parent, childId, content, options) {
      const oldEpoch = residents.get(childId)
      assert.ok(oldEpoch, 'the durable child was initially admitted')
      assert.equal(oldEpoch.parent, parent)
      assert.equal(oldEpoch.active, false, 'the first epoch has naturally ended before cold resume')
      options?.signal?.throwIfAborted()
      const resumed = { childId, parent, active: true, number: oldEpoch.number + 1 }
      residents.set(childId, resumed)
      messages.push({ parent, childId, content, resumed })
      return { messageId: 'cold-message' }
    },
    async drainChildren(parent, childIds) {
      assert.equal(this, raw, 'selected drain keeps the native service receiver')
      drains.push({ parent, childIds: [...childIds] })
      for (const childId of childIds) {
        const resident = residents.get(childId)
        if (resident?.parent === parent) resident.active = false
      }
    },
  }
  const ctx = {
    subagents: raw,
    logger: { warn() {} },
    effect(register) { effects.push(register()) },
  }
  function spec(parent, label) {
    return { provider: 'spawn', label, signal: new AbortController().signal,
      request: { parent, prompt: [{ type: 'text', text: label }], cwd: 'workspace' } }
  }
  return { ctx, raw, effects, starts, drains, messages, residents, spec }
}

test('cold-resumed modern child is drained by exact owner on context unload', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  const parent = { id: 'root-owner' }
  const otherRoot = { id: 'root-other' }
  const owned = await startContinuable(f.ctx, f.spec(parent, 'owned'))
  const first = f.starts.find(entry => entry.receipt === owned)

  first.epoch.active = false
  first.result.resolve({ stopReason: 'completed', output: [] })
  await tick()
  await f.raw.sendMessage(parent, owned.childId, [{ type: 'text', text: 'resume' }], { signal: new AbortController().signal })

  // Same-parent child from another plugin and another root must remain untouched.
  const peer = await f.raw.startActivation(f.spec(parent, 'other-plugin'))
  const foreign = await f.raw.startActivation(f.spec(otherRoot, 'other-root'))
  const peerEpoch = f.residents.get(peer.childId)
  const foreignEpoch = f.residents.get(foreign.childId)

  await f.effects[0]()

  assert.equal(f.drains.length, 1, 'cleanup uses the modern drain barrier for cold-resumed work')
  assert.equal(f.drains[0].parent, parent, 'cleanup preserves exact live parent identity')
  assert.deepEqual(f.drains[0].childIds, [owned.childId], 'cleanup selects only children admitted by this adapter context')
  assert.equal(first.receipt.disposeCalls, 0, 'a completed old-epoch receipt is not reused to dispose its cold-resumed epoch')
  assert.equal(f.residents.get(owned.childId).active, false, 'the resumed epoch is drained')
  assert.equal(peerEpoch.active, true, 'same-parent child owned by another plugin remains live')
  assert.equal(foreignEpoch.active, true, 'another root remains live')
})

test('context cleanup aborts pending admission and waits for its rollback', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  const admission = deferred()
  const begun = deferred()
  let admissionSignal
  f.raw.startActivation = spec => {
    admissionSignal = spec.signal
    begun.resolve()
    return admission.promise
  }
  const spec = f.spec({ id: 'root-pending' }, 'pending')
  const startup = startContinuable(f.ctx, spec)
  await begun.promise

  const cleanup = f.effects[0](), repeated = f.effects[0]()
  let cleanupSettled = false, repeatedSettled = false, returnedError
  cleanup.then(() => { cleanupSettled = true }, () => { cleanupSettled = true })
  repeated.then(() => { repeatedSettled = true }, () => { repeatedSettled = true })
  const rollbackFailure = new Error('fixture host rollback complete')
  let assertionError
  try {
    await tick()
    assert.deepEqual({ admissionAborted: admissionSignal.aborted, callerAborted: spec.signal.aborted, cleanupSettled, repeatedSettled },
      { admissionAborted: true, callerAborted: false, cleanupSettled: false, repeatedSettled: false },
      'both unload calls await rollback and cancel only the adapter admission scope')
  } catch (error) {
    assertionError = error
  } finally {
    // Release the fixture even when the current implementation fails the RED checks.
    admission.reject(rollbackFailure)
    returnedError = await startup.catch(error => error)
    await Promise.all([cleanup, repeated])
  }
  if (assertionError) throw assertionError
  assert.equal(returnedError, rollbackFailure, 'host admission failure keeps its original identity')
  assert.equal(cleanupSettled, true)
  assert.equal(repeatedSettled, true)
})

test('startup timeout abort after admission is not a lifetime cancellation', async () => {
  const { startContinuable } = await load()
  const f = fixture()
  const controller = new AbortController()
  const spec = f.spec({ id: 'root-timeout' }, 'timeout')
  spec.signal = controller.signal
  const receipt = await startContinuable(f.ctx, spec)
  controller.abort(new Error('startup timeout elapsed'))
  await tick()
  assert.equal(f.starts[0].spec.signal.aborted, false, 'successful admission detaches the host signal from the caller timer')
  assert.equal(f.starts[0].receipt.disposeCalls, 0)
  await f.effects[0]()
  assert.equal(f.starts[0].receipt.disposeCalls, 1)
  f.starts[0].result.resolve({ stopReason: 'aborted', output: [] })
  assert.ok(receipt)
})

test('pending startup cancellation preserves caller reason for live and already-aborted signals', async () => {
  const { startContinuable } = await load()
  for (const preAborted of [false, true]) {
    const f = fixture(), controller = new AbortController(), begun = deferred(), admission = deferred()
    const reason = new Error('caller startup cancellation ' + preAborted)
    let hostSignal
    f.raw.startActivation = function (spec) {
      assert.equal(this, f.raw)
      hostSignal = spec.signal
      begun.resolve()
      if (hostSignal.aborted) return Promise.reject(hostSignal.reason)
      hostSignal.addEventListener('abort', () => admission.reject(hostSignal.reason), { once: true })
      return admission.promise
    }
    const spec = f.spec({ id: 'root-caller' }, 'caller')
    spec.signal = controller.signal
    if (preAborted) controller.abort(reason)
    const startup = startContinuable(f.ctx, spec)
    const rejected = assert.rejects(startup, error => error === reason)
    await begun.promise
    if (!preAborted) controller.abort(reason)
    await rejected
    assert.notEqual(hostSignal, controller.signal, 'host scope is independent even when the caller already aborted')
    assert.equal(hostSignal.reason, reason)
    await f.effects[0]()
  }
})

test('selected drains group exact parent objects and concurrent unloads await every barrier', async () => {
  const { startContinuable } = await load()
  const f = fixture(), a = { id: 'same-root-id' }, b = { id: 'same-root-id' }
  const rows = []
  for (const [parent, label] of [[a, 'a1'], [a, 'a2'], [b, 'b1']]) {
    const receipt = await startContinuable(f.ctx, f.spec(parent, label))
    rows.push({ parent, receipt, first: f.starts.at(-1) })
  }
  for (const row of rows) { row.first.epoch.active = false; row.first.result.resolve({ stopReason: 'completed' }) }
  await tick()
  for (const row of rows) await f.raw.sendMessage(row.parent, row.receipt.childId, [], { signal: new AbortController().signal })
  const barriers = new Map([[a, deferred()], [b, deferred()]])
  const nativeDrain = f.raw.drainChildren
  f.raw.drainChildren = async function (parent, ids) {
    assert.equal(this, f.raw)
    f.drains.push({ parent, childIds: [...ids] })
    await barriers.get(parent).promise
    for (const id of ids) { const epoch = f.residents.get(id); if (epoch?.parent === parent) epoch.active = false }
  }
  const cleanup = f.effects[0](), repeated = f.effects[0]()
  let settled = false, repeatedSettled = false
  cleanup.then(() => { settled = true }, () => { settled = true })
  repeated.then(() => { repeatedSettled = true }, () => { repeatedSettled = true })
  try {
    await tick()
    assert.equal(f.drains.length, 2, 'one selected drain per exact parent, even when two parents share an id string')
    assert.deepEqual(f.drains.find(d => d.parent === a).childIds, rows.filter(r => r.parent === a).map(r => r.receipt.childId))
    assert.deepEqual(f.drains.find(d => d.parent === b).childIds, rows.filter(r => r.parent === b).map(r => r.receipt.childId))
    assert.deepEqual([settled, repeatedSettled], [false, false])
    barriers.get(a).resolve()
    await tick()
    assert.deepEqual([settled, repeatedSettled], [false, false], 'one finished parent does not finish context cleanup')
  } finally {
    for (const gate of barriers.values()) gate.resolve()
    await Promise.all([cleanup, repeated])
    f.raw.drainChildren = nativeDrain
  }
  assert.equal(f.drains.length, 2, 'concurrent unloads share the same drain work')
  for (const row of rows) {
    assert.equal(row.first.receipt.disposeCalls, 0, 'completed epoch receipts stay retired')
    assert.equal(f.residents.get(row.receipt.childId).active, false)
  }
})

test('selected drain failures are reported while other parent groups still receive cleanup', async () => {
  const { startContinuable } = await load()
  const f = fixture(), a = { id: 'root-fail' }, b = { id: 'root-ok' }, failure = new Error('selected cleanup failure')
  const first = await startContinuable(f.ctx, f.spec(a, 'fail'))
  const second = await startContinuable(f.ctx, f.spec(b, 'ok'))
  const attempted = [], nativeDrain = f.raw.drainChildren
  f.raw.drainChildren = function (parent, ids) {
    attempted.push({ parent, ids: [...ids] })
    if (parent === a) throw failure
    return nativeDrain.call(this, parent, ids)
  }
  const error = await f.effects[0]().then(() => null, error => error)
  assert.ok(error instanceof AggregateError)
  assert.ok(error.errors.includes(failure), 'the exact native drain error is retained')
  assert.deepEqual(attempted, [{ parent: a, ids: [first.childId] }, { parent: b, ids: [second.childId] }])
  assert.ok(f.starts.every(entry => entry.receipt.disposeCalls === 1), 'active receipt cleanup is retained for every parent')
})

test('completed parents that leave the registry are not reused as selected-drain authority', async () => {
  const { startContinuable } = await load()
  for (const replaced of [false, true]) {
    const f = fixture()
    const retired = { id: 'root-retired' }, active = { id: 'root-active' }
    const registry = new Map([[retired.id, retired], [active.id, active]])
    f.ctx.agents = { get(id) { return registry.get(id) } }
    const old = await startContinuable(f.ctx, f.spec(retired, 'retired-child'))
    const live = await startContinuable(f.ctx, f.spec(active, 'active-child'))
    const first = f.starts.find(entry => entry.receipt === old)
    first.epoch.active = false
    first.result.resolve({ stopReason: 'completed', output: [] })
    await tick()
    // Native ancestor teardown already released this tree before removing its root.
    f.residents.delete(old.childId)
    registry.delete(retired.id)
    const replacement = { id: retired.id }
    if (replaced) registry.set(retired.id, replacement)
    const peer = replaced ? await f.raw.startActivation(f.spec(replacement, 'replacement-peer')) : null
    const nativeDrain = f.raw.drainChildren
    f.raw.drainChildren = function (parent, ids) {
      if (registry.get(parent.id) !== parent) throw Object.assign(new Error('selected child teardown requires the exact live parent agent'), { code: 'UNAUTHORIZED' })
      return nativeDrain.call(this, parent, ids)
    }
    await assert.doesNotReject(f.effects[0](), 'unload must not reuse a retired root as release authority')
    assert.deepEqual(f.drains, [{ parent: active, childIds: [live.childId] }])
    assert.equal(first.receipt.disposeCalls, 0, 'the old completed epoch remains retired')
    assert.equal(f.residents.get(live.childId).active, false, 'other live owner groups are still cleaned')
    if (peer) assert.equal(f.residents.get(peer.childId).active, true, 'a new root sharing the id remains untouched')
  }
})
