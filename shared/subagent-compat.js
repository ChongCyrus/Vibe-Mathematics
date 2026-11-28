// DSH startContinuable -> startActivation compatibility at the admission boundary.
// Native sendMessage/interrupt and subagent/start/end remain the lifecycle authority.
// delivery:'caller' applies to the first activation only: the current host's cold
// resume uses parent delivery. This module does not promise silent resumed turns.
const contexts = new WeakMap()

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}
function unsupported(message) {
  return failure('VIBE_MATH_UNSUPPORTED_CAPABILITY', message)
}
function closed() {
  return failure('VIBE_MATH_CONTEXT_DISPOSED', 'Vibe-Mathematics preset context was disposed during child admission')
}
function ownership(ctx) {
  let state = contexts.get(ctx)
  if (state) return state
  if (typeof ctx.effect !== 'function') throw unsupported('Modern activation ownership requires ctx.effect')
  state = { closed: false, receipts: new Set(), known: new Map(), pending: new Set(), cleanup: null }
  contexts.set(ctx, state)
  ctx.effect(() => () => {
    if (state.cleanup) return state.cleanup
    state.closed = true
    // Publish one barrier before abort listeners can re-enter cleanup.
    state.cleanup = Promise.resolve().then(async () => {
      const pending = [...state.pending]
      for (const admission of pending) admission.controller.abort(closed())
      await Promise.all(pending.map(admission => admission.done))
      const active = [...state.receipts]
      state.receipts.clear()
      const work = active.map(receipt => () => receipt.dispose())
      // Receipts belong to epochs. Durable addresses also cover native sendMessage
      // cold resumes, without retaining or reusing a completed epoch's disposer.
      for (const [raw, parents] of state.known) {
        if (typeof raw.drainChildren !== 'function') continue
        for (const [parent, ids] of parents) work.push(() => {
          // Native ancestor teardown released a departed root's tree already.
          // Never reuse its authority or substitute a new Agent with the same id.
          if (typeof ctx.agents?.get === 'function' && ctx.agents.get(parent.id) !== parent) return
          return raw.drainChildren(parent, [...ids])
        })
      }
      state.known.clear()
      const results = await Promise.allSettled(work.map(async run => run()))
      const errors = pending.filter(admission => admission.cleanupError !== undefined).map(admission => admission.cleanupError)
      errors.push(...results.filter(result => result.status === 'rejected').map(result => result.reason))
      if (errors.length) throw new AggregateError(errors,
        'Vibe-Mathematics activation cleanup failed: ' + errors.map(String).join('; '))
    })
    return state.cleanup
  })
  return state
}

/** Admit a child, preserving the native receipt and exact live parent identity. */
export async function startContinuable(ctx, spec) {
  const raw = ctx.subagents
  // Older hosts own their established continuation contract, including filters.
  if (typeof raw.startContinuable === 'function') return raw.startContinuable(spec)
  if (typeof raw.startActivation !== 'function') throw unsupported('Host exposes neither startContinuable nor startActivation')
  const original = spec.request
  for (const field of ['toolFilter', 'persona', 'depthLimit']) {
    if (original[field] !== undefined) throw unsupported(
      'This host startActivation does not support request.' + field + '; the configured child constraint was not applied, so admission was stopped')
  }
  if (typeof raw.resolveMaxDepth !== 'function') throw unsupported('Host startActivation requires resolveMaxDepth to preserve the configured delegation limit')
  const request = { ...original, maxDepth: raw.resolveMaxDepth(original.maxDepth) }
  const state = ownership(ctx)
  if (state.closed) throw closed()
  const controller = new AbortController()
  let finish
  const admission = { controller, done: new Promise(resolve => { finish = resolve }), cleanupError: undefined }
  state.pending.add(admission)
  const forwardAbort = () => controller.abort(spec.signal.reason)
  spec.signal?.addEventListener('abort', forwardAbort, { once: true })
  if (spec.signal?.aborted) forwardAbort()
  async function release(receipt) {
    try { await receipt.dispose() } catch (error) { admission.cleanupError = error; throw error }
  }
  try {
    const receipt = await raw.startActivation({ ...spec, signal: controller.signal, request, delivery: 'caller' })
    // A startup timeout stops admission only; it must not cancel a resident later.
    spec.signal?.removeEventListener('abort', forwardAbort)
    if (!receipt || typeof receipt.childId !== 'string' || typeof receipt.result?.then !== 'function' || typeof receipt.dispose !== 'function') {
      if (typeof receipt?.dispose === 'function') await release(receipt)
      throw unsupported('Host startActivation returned an incomplete managed activation receipt')
    }
    // Keep exact receipt identities while their epoch is active, and observe errors.
    receipt.result.then(() => state.receipts.delete(receipt), error => {
      state.receipts.delete(receipt)
      ctx.logger.warn('Vibe-Mathematics activation ' + receipt.childId + ' failed: ' + String(error))
    })
    if (state.closed) {
      await release(receipt)
      throw closed()
    }
    state.receipts.add(receipt)
    let parents = state.known.get(raw)
    if (!parents) state.known.set(raw, parents = new Map())
    let ids = parents.get(original.parent)
    if (!ids) parents.set(original.parent, ids = new Set())
    ids.add(receipt.childId)
    return receipt
  } finally {
    spec.signal?.removeEventListener('abort', forwardAbort)
    state.pending.delete(admission)
    finish()
  }
}

/** Hold only pre-claim native events, then call the framework's existing handlers.
 * No event is emitted here. The receipt's exact child id is the claim capability;
 * unrelated events are discarded as the last admission window closes. */
export function createChildLifecycle(ctx, handlers) {
  ownership(ctx) // dispose the gate before receipt disposal can emit more native ends
  const pending = new Set(), unclaimed = new Set(), buffered = new Map()
  const limit = 1024
  let disposed = false
  ctx.effect(() => () => {
    disposed = true
    pending.clear(); unclaimed.clear(); buffered.clear()
  })
  function prune() {
    if (pending.size) return
    for (const id of buffered.keys()) if (!unclaimed.has(id)) buffered.delete(id)
  }
  function event(kind, info) {
    if (disposed || !info || typeof info.id !== 'string') return
    const id = info.id
    let agent
    if (kind === 'start') {
      try { agent = ctx.agents.get(id) } catch { /* provider may have no local Agent */ }
    }
    if (unclaimed.has(id) || (pending.size && !handlers.owns(id))) {
      let entry = buffered.get(id)
      if (!entry) {
        if (buffered.size >= limit) buffered.delete(buffered.keys().next().value)
        entry = {}; buffered.set(id, entry)
      }
      // One first epoch per admitted child. Duplicate native ends do not become
      // two framework replies while ownership is still being registered.
      if (kind === 'start') entry.start ||= { info, agent }
      else entry.end ||= info
      return
    }
    return handlers[kind]?.(info, agent)
  }
  return {
    async start(spec) {
      if (disposed) throw closed()
      const token = {}
      pending.add(token)
      try {
        const receipt = await startContinuable(ctx, spec)
        if (disposed) throw closed()
        unclaimed.add(receipt.childId)
        return receipt
      } finally {
        pending.delete(token); prune()
      }
    },
    startEvent(info) { return event('start', info) },
    endEvent(info) { return event('end', info) },
    claim(childId) {
      if (disposed || !unclaimed.delete(childId)) return
      const entry = buffered.get(childId)
      buffered.delete(childId); prune()
      if (entry?.start) handlers.start?.(entry.start.info, entry.start.agent)
      if (entry?.end) return handlers.end?.(entry.end)
    },
  }
}
