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
  bindMathComputation,
  registerMathComputation,
  probeMathEngines,
  mathAvailabilityLine,
  MATH_TOOL_NAME,
  MATH_FAILURE_CODES,
  MATH_PARAM_DEFAULTS,
  printedValueOf,
} from '../math-computation.js'
import { declaredDefault } from './settings-defaults.js'

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
/**
 * ★ ROUND 93 (measured on the live run): TWO VOCABULARIES ON ONE SEAM. The engine surface speaks
 * `{ op: probe|run|receipt|install, mode: code|file|expr, code|file|expr, engine, packages, timeoutMs }`;
 * the policy layer (`kernel/mathtools.js`) speaks `{ op: <plan name>, args, seed, backend, limits }`.
 * `kernel/index.js` wires the second into the first, so every plan run used to hand `args` to a closed
 * schema that has never heard of it and came back `MATH_INVALID_ARGUMENT: unknown argument: args` — a
 * refusal whose sentence names a key the CALLER never invented. Translate the request when the caller
 * gave an engine-executable body; otherwise refuse by name and say which vocabulary the seam speaks.
 */
const COMPUTATION_BODIES = ['code', 'file', 'expr']
export function planToComputationRequest(req = {}) {
  const args = req && req.args && typeof req.args === 'object' ? req.args : null
  const body = args ? COMPUTATION_BODIES.filter((k) => typeof args[k] === 'string' && args[k].trim() !== '')[0] : null
  if (!body) {
    return {
      ok: false,
      code: 'VMU_MATH_VOCABULARY',
      reason: 'the wired seam EXECUTES engines, so its `op` is run and its body is one of code/file/expr; this request carried none of them (plan op: ' + String(req && req.op) + ')',
      next: {
        hint: 'pass args { code: "print(2**10)" } | { expr: "2**10+1" } | { file: "Computation/x.py" } (engine/packages/timeoutMs are passed through), or call `math_computation` directly; the planning vocabulary (op + args + seed + backend) needs a PLANNING backend injected',
      },
    }
  }
  const out = { op: 'run', mode: body === 'code' ? 'code' : body === 'file' ? 'file' : 'expr' }
  out[body] = args[body]
  for (const k of ['engine', 'packages']) if (args[k] !== undefined) out[k] = args[k]
  const wall = req && req.limits ? Number(req.limits.wallMs) : NaN
  if (Number.isFinite(wall) && wall >= 1000) out.timeoutMs = Math.min(Math.round(wall), 3600000)
  return { ok: true, args: out, translated: { from: 'plan', to: 'computation', body, planOp: req && req.op, seed: req && req.seed, backend: req && req.backend } }
}

export function createMathSurface({ host, settings = {} } = {}) {
  if (!host || typeof host.register !== 'function' || typeof host.spawn !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the math surface needs a host with register() and spawn()',
      'inject a host adapter (docs/11 §4.1); tests use tests/helpers/math-computation-fake-seam.mjs')
  }
  // ROUND 202: a host that ALREADY carries the tool (host-math.js publishes it at assembly) binds without a second
  // publication — see host-math.js `register` for the measured refusal this avoids.
  const alreadyPublished = typeof host.hasTool === 'function' && host.hasTool(MATH_TOOL_NAME)
  const bound = bindMathComputation(host, { publish: !alreadyPublished })
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

    /**
     * ★ ROUND 93: the entry `kernel/index.js` wires the policy layer into. Same classification rules as
     * `run()`; the only addition is the vocabulary translation above, and its refusal is a NAMED one
     * (`VMU_MATH_VOCABULARY`) instead of a silent null.
     */
    async runPlan(req = {}) {
      const shim = planToComputationRequest(req)
      if (!shim.ok) return { raw: shim, ok: false, code: shim.code, message: shim.reason, hint: shim.next && shim.next.hint, isRefutation: false }
      const raw = await bound.handler(shim.args)
      const out = classifyOutcome(raw)
      if (out.ok === false) return Object.assign({ raw }, out)
      // ★ ROUND 94: an EMPTY stdout used to become `value: 0` whenever the exit code was 0. In mode 'expr'
      // the engine evaluates the expression and prints nothing, so that rule reported `0` for `2**10+1` — a
      // number the engine never produced, on the SUCCESS path, with no way for a reader to tell. A run that
      // printed nothing has no value: say so, name it, and let the caller re-run with mode:'code'.
      const { value, valueMissing, valueMeans } = printedValueOf(raw.stdout)
      return {
        ok: true,
        isRefutation: false,
        result: {
          value, valueMissing,
          valueMeans,
          engine: raw.engine || null, exit: raw.exit === undefined ? null : raw.exit,
          stdout: raw.stdout === undefined ? null : raw.stdout, stderr: raw.stderr === undefined ? null : raw.stderr,
          mode: raw.mode || null, runId: raw.runId || null, ms: raw.ms === undefined ? null : raw.ms,
          receipt: raw.receipt || null, vocabulary: 'computation', planOp: req && req.op,
          translated: shim.translated,
        },
        raw,
      }
    },

    /** Which vocabulary the injected seam speaks (a reader must not have to guess it from a refusal). */
    planVocabulary() {
      return {
        seam: 'engine-execution',
        seamOp: ['probe', 'run', 'receipt', 'install'],
        seamBody: COMPUTATION_BODIES.slice(),
        planOp: 'accepted but translated: args { code|file|expr } becomes op "run"',
        translate: 'kernel/index.js wires this surface as the policy layer\'s spawn, so a plan run is translated here',
      }
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
        engines: declaredDefault('vmu.math.engines') !== undefined && settings['vmu.math.engines'] === undefined
          ? declaredDefault('vmu.math.engines')
          : (settings['vmu.math.engines'] || []),
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
