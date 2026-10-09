// vmu math & formalisation surface — the capability, with policy left outside (docs/09).
//
// What this module is: the adapter that lets vmu OFFER the shared math_computation capability. The
// heavy lifting (engine detection, argv templating, receipts, archive retention, install planning) lives
// in the SHARED module `../math-computation.js`, which the recon verdict marked "reuse as is" - it is the
// one extraction this repository ever finished, and every preset ships a byte-identical copy.
//
// What this module deliberately is NOT:
//   · it never decides WHEN formalisation is required, or whether an informal argument counts
//     (docs/09 §5 decision points; `REQUIRE_FORMALIZATION` stays false and the decisions belong to
//     settings/middleware/packs);
//   · it never turns a computation into a REFUTATION. `classifyOutcome` marks every non-ok outcome
//     `isRefutation: false`: a compile failure or a bad argv is a DEFECT of the formalisation, not a
//     disproof of the claim (docs/09 §6, the v5r line's hard-won distinction);
//   · it never fakes availability: a missing engine or toolchain is refused by NAME
//     (`VMU_ENGINE_UNAVAILABLE`), never reported as a successful computation.
//
// The host is INJECTED (docs/11 §4.1 seam discipline): the shape is the one the shared module's
// `adaptHost` expects, and tests drive it with tests/helpers/math-computation-fake-seam.mjs, so both the
// engine-present and the engine-absent paths are reproducible on any machine.

import {
  registerMathComputation,
  probeMathEngines,
  mathAvailabilityLine,
  MATH_TOOL_NAME,
  MATH_FAILURE_CODES,
  MATH_PARAM_DEFAULTS,
} from '../math-computation.js'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The capability is available by default; whether it is REQUIRED is policy, and policy is not here. */
export const REQUIRE_FORMALIZATION = false

/** How an unavailable engine is handled by default: degrade with a named reason, never pretend. */
export const ON_UNAVAILABLE = 'degrade'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/**
 * Classify one raw outcome of the shared module into vmu's named contract.
 * The rule that matters: nothing here can ever say "the claim is false".
 */
export function classifyOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') {
    return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', kind: 'unavailable', isRefutation: false,
      message: 'no engine outcome was produced', hint: 'probe first; a missing toolchain is a named degradation, not a result' }
  }
  if (outcome.ok === true) {
    return { ok: true, kind: 'computed', isRefutation: false, receipt: outcome.receipt || null }
  }
  const code = outcome.code || outcome.failure || 'MATH_INVALID_ARGUMENT'
  const unavailable = code === 'MATH_ENGINE_NOT_FOUND' || code === 'MATH_NO_SUBPROCESS' || code === 'MATH_ENGINE_UNAVAILABLE'
  return {
    ok: false,
    code: unavailable ? 'VMU_ENGINE_UNAVAILABLE' : code,
    kind: unavailable ? 'unavailable' : 'defect',
    isRefutation: false, // ALWAYS: a failed computation never refutes a proposition
    message: outcome.message || String(code),
    hint: outcome.next && outcome.next.hint ? outcome.next.hint : null,
    original: unavailable ? code : undefined,
  }
}

/**
 * R-b (P3 containment §6): the ONLY way a formalisation may ever be recorded as settled (`passed`).
 * v5r's rule is kept verbatim because it closes a real hole - a compile that "succeeded" while the file
 * changed underneath is not evidence about the file anyone is looking at:
 *
 *     settled  <=>  exit 0  AND  the compiled content hash is unchanged
 *
 * Everything else stays `attempted` (and an unavailable engine stays `unavailable`). This is a report
 * about the TOOLING, never a verdict about the mathematics: `isRefutation` remains false below.
 */
export const LEAN_SETTLED_RULE = 'exit-0-and-content-hash-unchanged'

export function settled(outcome, { hashBefore = null, hashAfter = null } = {}) {
  if (!outcome || outcome.ok !== true) {
    return { settled: false, state: 'attempted', rule: LEAN_SETTLED_RULE, isRefutation: false,
      reason: outcome && outcome.kind === 'unavailable' ? 'the engine is unavailable, so nothing was settled' : 'the run did not exit cleanly' }
  }
  if (hashBefore === null || hashAfter === null) {
    return { settled: false, state: 'attempted', rule: LEAN_SETTLED_RULE, isRefutation: false,
      reason: 'no content hash was supplied: a success without a hash cannot be distinguished from a file that changed mid-compile' }
  }
  if (hashBefore !== hashAfter) {
    return { settled: false, state: 'attempted', rule: LEAN_SETTLED_RULE, isRefutation: false,
      reason: 'the compiled file changed while compiling (hash ' + String(hashBefore).slice(0, 12) + ' -> ' + String(hashAfter).slice(0, 12) + ')' }
  }
  return { settled: true, state: 'passed', rule: LEAN_SETTLED_RULE, isRefutation: false,
    reason: 'exit 0 and the compiled content is unchanged' }
}

/**
 * Create the surface over an injected host. `settings` is the resolved settings map; the only keys this
 * surface reads are the harmless capability switches (docs/04 §11), never a policy about truth.
 */
export function createMathSurface({ host, settings = {} } = {}) {
  if (!host || typeof host.register !== 'function' || typeof host.spawn !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the math surface needs a host with register() and spawn()',
      'inject a host adapter (docs/11 §4.1); tests use tests/helpers/math-computation-fake-seam.mjs')
  }
  const bound = registerMathComputation(host)
  const registered = { name: bound.toolName, parameters: bound.parameters }

  return {
    toolName: MATH_TOOL_NAME,
    registered,
    failureCodes: MATH_FAILURE_CODES.slice(),
    paramDefaults: Object.assign({}, MATH_PARAM_DEFAULTS),

    /** Engine availability, as reported by the shared module (no caching, no invention). */
    async probe(opts) {
      const report = await bound.probe(opts)
      return {
        ok: true,
        engines: (report && report.engines ? report.engines : []).map((e) => ({ name: e.name, version: e.version || null })),
        available: !!(report && report.engines && report.engines.length > 0),
      }
    },

    /** The tool handler, already classified (a caller can never mistake a failure for a refutation). */
    async run(args) {
      const raw = await bound.handler(args)
      return Object.assign({ raw }, classifyOutcome(raw))
    },

    /** The availability line for prompt injection (docs/09 §7); policy-free, wording only. */
    availabilityLine(probeReport, lang, mathMode) {
      return mathAvailabilityLine(probeReport, lang, mathMode || settings['vmu.math.mode'])
    },

    /** R-b: the only way a formalisation may be recorded as settled. Exposed so callers cannot invent a
     *  laxer rule of their own (a caller that skips this and marks `passed` on exit 0 is the v5r bug). */
    settled,

    /** Observability (R11): what is on offer, and what it refuses to decide. */
    status() {
      return {
        tool: MATH_TOOL_NAME,
        engines: settings['vmu.math.engines'] || [],
        compileTimeoutMs: settings['vmu.math.compileTimeoutMs'] || 0,
        requireFormalization: REQUIRE_FORMALIZATION,
        onUnavailable: ON_UNAVAILABLE,
        failureCodes: MATH_FAILURE_CODES.length,
        neverRefutes: true,
        settledRule: LEAN_SETTLED_RULE,
      }
    },
  }
}
