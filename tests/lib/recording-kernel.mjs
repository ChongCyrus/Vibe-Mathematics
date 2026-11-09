// ── recording kernel: a READ-ONLY recording Proxy for the kernel services (TB-2673 §3.1) ─────────────────────────
//
// Why this exists: in Phase 1 (TB-2668) the criterion `kernelKeys - hostKeys === 0` could only be applied to the seven
// tool faces written inside `vibe-math-vmu/host.js`. The other faces are `make<Face>Spec` factories in
// `vibe-math-vmu/tools/*.js`: each calls the kernel itself and decides what to return. Rather than hand-inventorying
// every factory (which drifts), we wrap the kernel object handed to `host.toolSpecs()` in a Proxy that records every
// receipt-shaped value the faces get back. The gate can then compare `union(recorded keys) - faceReceiptKeys`.
//
// The recorder is a TEST LIBRARY, not product code: it must never change what the product does.
//   - only `get` is intercepted; `set`/`deleteProperty`/`defineProperty`/`ownKeys` all go to the target untouched;
//   - a function is called with the ORIGINAL target as `this` (so services behave exactly as before);
//   - the returned value is passed through unchanged (same reference), only inspected/recorded;
//   - service objects are wrapped lazily up to `maxDepth` (default 3) so `kernel.store.read(...)` is reachable but the
//     recursion cannot run away;
//   - a thenable's resolved value is recorded after it settles; a rejection is re-thrown unchanged (never swallowed).
//
// `looksLikeReceipt` is deliberately NARROW and named: a plain object (or a refusal Error) with >= 2 top-level keys and
// at least one seam marker (`ok` boolean, `code` string, or `action` string). A wide predicate (anything object-shaped)
// would report intermediate values as receipts and drown the gate in false findings — the self-test proves the
// difference by switching the predicate to `() => true` and watching the gate light up.

const isPlainObject = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  if (v instanceof Date || v instanceof Promise || typeof v.then === 'function') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** A kernel value that is a receipt: a plain object, or a named refusal (Error) carrying seam keys. */
export function looksLikeReceipt(v) {
  if (!v || typeof v !== 'object') return false
  if (Array.isArray(v) || v instanceof Date || v instanceof Promise || typeof v.then === 'function') return false
  const plain = isPlainObject(v)
  const refusal = v instanceof Error
  if (!plain && !refusal) return false
  const keys = Object.keys(v)
  if (keys.length < 2) return false
  return typeof v.ok === 'boolean' || typeof v.code === 'string' || typeof v.action === 'string'
}

/**
 * Wrap `kernelLike` in a read-only recording Proxy.
 * @returns {{ proxy: any, receipts: Array<{path: string, kind: 'object'|'error', keys: string[], value: any }>,
 *             reset: () => void, assertRecorded: (label?: string) => number }}
 */
export function recordKernelReceipts(kernelLike, opts = {}) {
  const maxDepth = Number.isInteger(opts.maxDepth) ? opts.maxDepth : 3
  const receiptPredicate = typeof opts.receiptPredicate === 'function' ? opts.receiptPredicate : looksLikeReceipt
  const receipts = []
  let seenValues = new WeakSet()

  const capture = (value, path) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value) || value instanceof Date || value instanceof Promise || typeof value.then === 'function') return
    if (seenValues.has(value)) return // depth dedupe: one object reference is one receipt, even if returned twice
    if (!receiptPredicate(value)) return
    seenValues.add(value)
    receipts.push({ path, kind: value instanceof Error ? 'error' : 'object', keys: Object.keys(value), value })
  }

  // one proxy per (target, depth) so repeated gets return a stable identity (faces sometimes compare references)
  const cache = new WeakMap()
  const proxyFor = (target, path, depth) => {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return target
    if (depth > maxDepth) return target
    let byDepth = cache.get(target)
    if (!byDepth) { byDepth = new Map(); cache.set(target, byDepth) }
    if (byDepth.has(depth)) return byDepth.get(depth)
    const proxy = new Proxy(target, {
      get(t, key, receiver) {
        const value = Reflect.get(t, key, receiver)
        const childPath = path ? path + '.' + String(key) : String(key)
        if (typeof value === 'function') {
          return function (...args) {
            let out
            try { out = value.apply(t, args) } catch (err) { capture(err, childPath); throw err }
            if (out && (typeof out === 'object' || typeof out === 'function') && typeof out.then === 'function') {
              return out.then(
                (settled) => { capture(settled, childPath); return settled },
                (err) => { capture(err, childPath); throw err }, // rejections are NOT swallowed
              )
            }
            capture(out, childPath)
            return out
          }
        }
        if (value && (typeof value === 'object')) {
          if (isPlainObject(value) || typeof value === 'function') return proxyFor(value, childPath, depth + 1)
          return value
        }
        return value
      },
    })
    byDepth.set(depth, proxy)
    return proxy
  }

  // `kernel.` prefix keeps recorded paths in the same namespace the exception tables use (kernel.records.list), so a
  // Phase 2 finding points at the same name Phase 1 would have used.
  const proxy = proxyFor(kernelLike, 'kernel', 0)
  return {
    proxy,
    receipts,
    reset() { receipts.length = 0; seenValues = new WeakSet() },
    /** Fallback for the TB-2673 §6 risk "the Proxy saw nothing": a face that read the kernel through a captured raw
     *  reference would record zero receipts. Callers must NAME that point (`noRecordedCalls`), never count it as pass;
     *  this helper just makes the count explicit and throws where a caller expects at least one receipt. */
    assertRecorded(label = 'this face') {
      if (receipts.length === 0) throw new Error(label + ' recorded 0 kernel receipts (the Proxy may be bypassed by a captured raw reference)')
      return receipts.length
    },
  }
}

export default { looksLikeReceipt, recordKernelReceipts }
