/**
 * v5r's METRIC COUNTER (Round 20, task-126) — THE PRODUCER THE THRESHOLD REPORT WAS MISSING.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────────────────
 * `vmu-assistant2`'s R20 real DSH session measured it exactly: the round boundary DID fire its `event`-type
 * reports unattended, but both `threshold` declarations stayed silent — because **nothing in the shipped deployment
 * ever called `vmu.metrics.observe()`** ⇒ `kernel.metricValues()` was `{}` ⇒ `thresholdMet()` answered `false`,
 * which is its honest answer ("no observation ⇒ no key", `kernel/index.js:723`).
 *
 * WHY THE DEPLOYMENT COULD NOT FIX IT: `vmu.middleware.entries` routes a non-rules entry through `bus.add()`, and
 * **the bus does not load files** (`kernel/bus.js`), so such an entry never receives `api`. Only a pack's
 * `module:` / `file:` entry goes through `kernel/loader.js`, which attaches the capability-gated
 * `api.services.get(name)` seam. ⇒ THE PRODUCER HAD TO BE A PACK MODULE. That is also the R1 ruling: the framework
 * supplies the capability (`vmu.metrics` + the hooks), THE PACK decides what to count and when.
 *
 * ── WHAT IT COUNTS (the policy, as DATA — change the table, not the code) ────────────────────────────────────────
 *   · `tools/result`   → `tool-results`  : +1 per COMPLETED TOOL CALL. This is the event that ALWAYS exists inside
 *     a real turn, so a one-turn session can reach a threshold. The host bundle's own guidance picks this hook for
 *     exactly this job: "Observe final tool outcomes on `tools/result`; use `tools/post-execute` only to transform
 *     a result" — and it is registered `blockable:false, rewritable:false` (`kernel/bus.js`), so a counter cannot
 *     alter the call it is watching.
 *   · `math/job-settled` / `lean/job-settled` → `settled-jobs` : +1 per settled computation/formalisation job —
 *     the institute's own "an artefact-producing step finished" event.
 *
 * ★ WHY NOT `agent/turn-stopping`: the report boundary listens on that very hook (`vibe-math-vmu.js`). Writing the
 * observation at the same instant as the reader makes the round's order decide whether the boundary can SEE it this
 * turn — in a single-turn script that reads as "the threshold never fired". Both hooks above are INTRA-turn.
 *
 * ── ZERO MECHANISM, AND TWO KINDS OF "NOT RECORDED" (neither is silent) ──────────────────────────────────────────
 * The indicator names must be DECLARED by the deployment (`vmu.metrics.indicators`). When they are not:
 *   · nothing declared at all ⇒ the face itself skips and counts it (`recorded:false, configured:false`, reason
 *     "no indicators declared (zero mechanism)") — this module passes that reason through and counts the skip;
 *   · declared, but THIS name is not in the list ⇒ the face refuses BY NAME (`VMU_METRIC_UNAVAILABLE`, listing what
 *     IS declared). A counter must not take a session down over that, so the refusal is converted into a NAMED SKIP
 *     (`ok:false` + the face's own code) and COUNTED (`counters().skippedUndeclared`) — never a silent no-op, and
 *     never a new error code invented here.
 * `failure: 'open'` on the manifest entry is the same stance: a counter may not break the work it counts.
 */

/** The counter's identity: it is the `by` on every observation, so a reader can tell WHO counted. */
export const COUNTER_BY = 'v5r.artifact-counter'

/**
 * THE POLICY TABLE (data, not branches): which hook feeds which declared indicator. A deployment that wants a
 * different policy changes THIS list (or writes its own module) - the framework is not touched.
 */
export const COUNTER_POLICY = Object.freeze([
  Object.freeze({ indicator: 'tool-results', on: Object.freeze(['tools/result']), count: 1, meaning: 'a tool call completed inside this turn (the event every real turn has)' }),
  Object.freeze({ indicator: 'settled-jobs', on: Object.freeze(['math/job-settled', 'lean/job-settled']), count: 1, meaning: 'a computation/formalisation job settled (an artefact-producing step finished)' }),
])

/** Every hook this module subscribes to — derived from the table, so the two can never disagree. */
export const COUNTER_HOOKS = Object.freeze([...new Set(COUNTER_POLICY.flatMap((row) => row.on.slice()))])

/** Which indicator a given hook feeds (`null` = this module does not watch that hook). */
export function indicatorFor(hook) {
  const row = COUNTER_POLICY.find((r) => r.on.includes(String(hook)))
  return row ? row.indicator : null
}

/**
 * Build the module object. The counters live in this closure and are readable through `counters()`, so a test or an
 * operator can see that a SKIP happened (a skip nobody can read is how this class of gap stays invisible).
 */
export function createCounterModule() {
  const state = { attempts: 0, observed: 0, skippedUnconfigured: 0, skippedUndeclared: 0, unreadableSeam: 0, last: null }

  const counters = () => Object.assign({}, state)

  /** One hook handler per policy row. `flat` is the loader's flattened event (it carries the injected `api`). */
  const counter = (indicator) => async (flat = {}) => {
    const event = flat && typeof flat === 'object' ? flat : {}
    const row = COUNTER_POLICY.find((r) => r.indicator === indicator) || { count: 1 }
    state.attempts += 1
    const seam = event.api && event.api.services && typeof event.api.services.get === 'function' ? event.api.services : null
    if (!seam) {
      // No loader-attached api: an INLINE bus entry can never count (that is why this is a module entry).
      state.unreadableSeam += 1
      return { ok: false, counted: false, indicator, code: 'VMU_ENGINE_UNAVAILABLE', value: 0,
        reason: 'this handler has no api.services seam: the entry was not loaded through kernel/loader.js',
        counters: counters() }
    }
    let metrics = null
    try { metrics = seam.get('vmu.metrics') } catch (e) {
      state.unreadableSeam += 1
      return { ok: false, counted: false, indicator, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', value: 0,
        reason: String((e && e.message) || e), counters: counters() }
    }
    try {
      const out = metrics.observe({
        name: indicator,
        value: Number(row.count) || 1,
        by: COUNTER_BY,
        kind: 'read',
        source: 'middleware',
        labels: { hook: event.hook === undefined ? null : String(event.hook), tool: event.tool === undefined ? null : String(event.tool) },
        at: event.at === undefined ? null : event.at,
      })
      if (out && out.recorded === true) {
        state.observed += 1
        state.last = { indicator, at: out.at === undefined ? null : out.at, recorded: true }
        return { ok: true, counted: true, indicator, value: Number(row.count) || 1, at: out.at === undefined ? null : out.at, counters: counters() }
      }
      // The face's own zero-mechanism skip: NOT an error, and it carries its own reason.
      state.skippedUnconfigured += 1
      state.last = { indicator, at: out && out.at !== undefined ? out.at : null, recorded: false }
      return { ok: true, counted: false, indicator, value: 0, configured: !!(out && out.configured),
        reason: (out && out.reason) || 'not recorded', counters: counters() }
    } catch (e) {
      // DECLARED-BUT-UNKNOWN (or any other named refusal from the face): a NAMED SKIP, counted. The face's own code.
      state.skippedUndeclared += 1
      state.last = { indicator, at: null, recorded: false, code: (e && e.code) || 'VMU_METRIC_UNAVAILABLE' }
      return { ok: false, counted: false, indicator, value: 0, code: (e && e.code) || 'VMU_METRIC_UNAVAILABLE',
        reason: String((e && e.message) || e), hint: e && e.hint ? e.hint : null, counters: counters() }
    }
  }

  const hooks = {}
  for (const row of COUNTER_POLICY) for (const hook of row.on) hooks[hook] = counter(row.indicator)

  return Object.freeze({
    meta: Object.freeze({ id: COUNTER_BY, apiVersion: 1 }),
    capabilities: Object.freeze(['trigger-workflow', 'record']),
    hooks: Object.freeze(hooks),
    // Read-only introspection (the loader ignores extra keys; a skip that cannot be read is a skip nobody sees).
    counters,
    policy: COUNTER_POLICY,
  })
}

/** The M2 module object `kernel/pack.js` hands to `kernel/loader.js`. */
export const V5R_ARTIFACT_COUNTER = createCounterModule()

export default V5R_ARTIFACT_COUNTER
