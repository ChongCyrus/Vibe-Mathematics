// vibe-math-vmu/kernel/jobbudget.js — THE SHARED JOB BUDGET PRIMITIVES (TB-2794 Step 5, extracted from mathjobs.js).
//
// WHY THIS FILE EXISTS: createChildBudget, the ONE default timer site, the enforced-scope marker, the lexical jobs-dir
// helper and the recovery-lease TTL are used by the KERNEL own engines (lean / mathadapters / script-bridge) AND by the
// math-jobs face. When the face moves into packs/research-core, the kernel must not import from a pack (that would be a
// kernel-to-pack reverse dependency), so these generic primitives live HERE and the pack imports THIS file.
/**
 * ROUND 9 · C：崩溃恢复的**租约**默认 TTL（毫秒）。见 `createJobMirror.takeLease`：TTL 只是"多久算陈旧"的
 * 猜测，所以调用方按 **job 自己的预算 + 30 s** 取上界，避免把**正在跑**的恢复当陈旧而抢走。
 */
export const RECOVERY_LEASE_TTL_MS = 120000

/**
 * THE scope marker every receipt AND every refusal carries (repo D3: a result is never scope-less).
 * Defined ONCE here; the Lean face and the adapter face import it ⇒ one meaning, one name.
 */
export const ENFORCED_SCOPE = 'evaluated-so-far'

const DEFAULT_JOBS_DIR = 'Math/Jobs'
/**
 * A named refusal. `enforced` lists the SETTINGS KEYS whose value took part in this refusal — an empty
 * array when the decision came from the arguments, the injected seams or a static registry (that is the
 * honest answer, never a missing one). `enforcedScope` says how far the evaluation got.
 */
export const refuse = (code, message, hint, enforced) => ({
  ok: false, code, message, hint,
  enforced: Array.isArray(enforced) ? enforced.slice() : [],
  enforcedScope: ENFORCED_SCOPE,
})

/** 镜像目录只接受 root 相对、无 `..`/盘符/绝对路径的词法路径（越界 ⇒ 具名拒，不猜）。 */
export function safeRelDir(rel) {
  const raw = String(rel == null ? '' : rel).trim().replace(/\\/g, '/')
  if (!raw) return DEFAULT_JOBS_DIR
  if (raw.charAt(0) === '/' || /^[a-z]:/i.test(raw)) return null
  const parts = []
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') return null
    parts.push(seg)
  }
  return parts.length ? parts.join('/') : DEFAULT_JOBS_DIR
}

/**
 * THE ONE default timer seam (`(cb, ms) => disposer`). It is exported because it is the framework's **single**
 * global-timer site: every other module that needs "wait ms" goes through an INJECTED seam and falls back to
 * THIS function, so no second module ever grows its own `setTimeout` (F15's inventory stays 1 site + 1 row).
 * Returns a real disposer: handing back the platform `Timeout` object was the F15 defect.
 */
export function defaultTimer(cb, ms) {
  const h = setTimeout(cb, ms)
  return () => clearTimeout(h)
}

/**
 * THE ONE CHILD-BUDGET primitive (Round 4 · F17): give every spawned child a HARD budget, and **really
 * terminate** it when the budget fires — the host's `graceMs` is only a request, so relying on it alone
 * leaves a runaway process alive while we report a timeout.
 *
 * THREE CALL SHAPES, all auto-detected (no flag to get wrong):
 *   · a **host-native handle** — `spawn(spec)` returns `SubprocessHandle` SYNCHRONOUSLY (this is what the DSH
 *     `subprocess` service documents: `spawn(spec): SubprocessHandle` with `terminate()`, `waitForExit()`,
 *     `done`, and offset-based non-consuming `collected.{stdout,stderr}.readFrom(fromByte)`). Then
 *     `terminate()` is real and `lossy`/`spillPath` from a reader are the HOST's own truncation report.
 *   · `spawnHandle(spec, onHandle)` — an explicit killable seam; it must call `onHandle(h)` synchronously.
 *   · a promise seam `spawn(spec) => Promise<result>` — legacy: the budget still fires (the caller never
 *     hangs) but nothing can be killed, so the result says `terminated:false`/`hadHandle:false` instead of
 *     pretending (that lie is exactly what F17 caught).
 *   · `timer` — optional `(cb, ms) => disposer` seam (same shape as `ctx.timeout`). The DEFAULT returns a real
 *     disposer (`() => clearTimeout(h)`), because the platform's `setTimeout` hands back a `Timeout` object and
 *     calling THAT is a TypeError — the F15 defect peer-measured here (the armed timer was never cleared and
 *     the failure was swallowed by a `catch`). An injected seam may still return a `Timeout`/immediate-shaped
 *     object; it is cleared explicitly. A cleanup failure is **reported**, never swallowed.
 *   · `onNote(what, detail)` — optional; receives `timer-cleanup-failed`.
 *
 * Returns `{ result, timedOut, terminated, hadHandle, cleanupFailed }`. It never throws for a timeout; it
 * throws only when the call itself throws (the caller keeps its own error handling).
 */
export function createChildBudget({ timer = null, onNote = null, onHandle = null } = {}) {
  const note = typeof onNote === 'function' ? onNote : () => {}
  const handleSeen = typeof onHandle === 'function' ? onHandle : () => {}
  const seeHandle = (h) => {
    try { handleSeen(h) } catch (e) { note('onhandle-failed', { detail: String((e && e.message) || e) }) }
  }
  // The default seam ALWAYS returns a callable disposer (see the header: returning the Timeout itself is the bug).
  // It IS the exported `defaultTimer` — one global-timer site for the whole framework (F15 inventory).
  const setT = typeof timer === 'function' ? timer : defaultTimer
  /** Dispose whatever the timer seam returned; a non-disposable is a NAMED failure (never a silent catch). */
  const disposeTimer = (d) => {
    if (d === null || d === undefined) return null
    if (typeof d === 'function') { d(); return null }
    // A platform `Timeout`/`Immediate` (or any object clearTimeout accepts): clear it explicitly.
    if (typeof d === 'object' && typeof clearTimeout === 'function') { clearTimeout(d); return null }
    return 'timer seam returned a non-disposable (' + typeof d + ')'
  }
  /** Read one collected stream non-consumingly; `lossy`/`spillPath` are the host's own report. */
  const readCollected = (handle, stream) => {
    try {
      const reader = handle && handle.collected && handle.collected[stream]
      if (!reader || typeof reader.readFrom !== 'function') return { text: '', lossy: false, spillPath: null }
      const r = reader.readFrom(0) || {}
      return { text: String(r.text === undefined ? '' : r.text), lossy: !!r.lossy, spillPath: r.spillPath || null }
    } catch (e) { return { text: '', lossy: false, spillPath: null } }
  }
  return async function runWithBudget({ call, timeoutMs, label = 'child', onHandle: callOnHandle = null }) {
    let handle = null
    let timedOut = false
    let terminated = false
    let timerDisposer = null
    let cleanupFailed = null
    /** Notify BOTH the factory-level and the per-call `onHandle` consumers (the job faces pass it per call). */
    const handleSeenNow = (h) => {
      seeHandle(h)
      if (typeof callOnHandle === 'function') {
        try { callOnHandle(h) } catch (e) { note('onhandle-failed', { label, detail: String((e && e.message) || e) }) }
      }
    }
    // The seam is invoked SYNCHRONOUSLY here (not inside a `.then`): the host-native `spawn` hands back a live
    // handle in the same tick, and `onHandle` consumers (the job faces' `cancel`) must be able to see it before
    // any await — otherwise "cancel right after submit" would race the handle into existence.
    let outSync
    let syncErr = null
    try { outSync = call((h) => { handle = h; handleSeenNow(h) }) } catch (e) { syncErr = e }
    // Host-native handle: `spawn` answered synchronously with something that has `done`. Detect it HERE (same
    // tick) so `onHandle` consumers see the live handle before any await.
    if (!syncErr && outSync && typeof outSync.then !== 'function' && outSync.done && typeof outSync.done.then === 'function') {
      handle = outSync
      handleSeenNow(outSync)
    }
    const done = (syncErr
      ? Promise.reject(syncErr)
      : Promise.resolve(outSync))
      .then((out) => {
        if (out && typeof out.then !== 'function' && out.done && typeof out.done.then === 'function') {
          handle = out
          seeHandle(out)
          return Promise.resolve(out.done).then((o) => {
            const so = readCollected(out, 'stdout')
            const se = readCollected(out, 'stderr')
            return {
              exitCode: o && o.exitCode !== undefined ? o.exitCode : null,
              signal: (o && o.signal) || null,
              stdout: so.text, stderr: se.text,
              stdoutLossy: so.lossy, stderrLossy: se.lossy,
              stdoutSpill: so.spillPath, stderrSpill: se.spillPath,
            }
          })
        }
        return out
      })
      .then((v) => ({ settled: true, value: v }), (e) => ({ settled: false, error: e }))
    const budget = new Promise((resolve) => {
      timerDisposer = setT(() => {
        timedOut = true
        try {
          if (handle && typeof handle.terminate === 'function') { handle.terminate(); terminated = true }
          else if (handle && typeof handle.kill === 'function') { handle.kill(); terminated = true }
        } catch (e) { /* the race result is the report */ }
        resolve({ settled: true, value: { exitCode: null, signal: 'SIGTERM', timedOut: true, terminated } })
      }, Math.max(1, Number(timeoutMs) || 1))
    })
    let r
    try {
      r = await Promise.race([done, budget])
    } finally {
      // `done`/error wins ⇒ the timer must not fire later. When the TIMEOUT won, the timer already fired and
      // disposing it is a no-op, so this is safe in either order. A CLEANUP FAILURE IS REPORTED (F15): the old
      // shape swallowed a TypeError here, so the default deployment never cleared its timer and nobody knew.
      try {
        cleanupFailed = disposeTimer(timerDisposer)
        if (cleanupFailed) note('timer-cleanup-failed', { label, detail: cleanupFailed })
      } catch (e) {
        cleanupFailed = String((e && e.message) || e)
        note('timer-cleanup-failed', { label, detail: cleanupFailed })
      }
    }
    if (r.settled) {
      const value = r.value || {}
      return { result: value, timedOut: !!(value.timedOut || timedOut), terminated: !!(value.terminated || terminated), hadHandle: !!handle, cleanupFailed }
    }
    throw r.error
  }
}
