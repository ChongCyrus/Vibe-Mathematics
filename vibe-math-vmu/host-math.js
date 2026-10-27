// vmu host math — the REAL host adapter for the shared `math_computation` module (V9).
//
// The shared module (`math-computation.js`, reused verbatim from the older presets) talks to an injected
// host seam. Its contract is the one `tests/helpers/math-computation-fake-seam.mjs` mirrors:
//
//   register(name, description, parameters, handler)   // parameters is ALREADY a host-shaped object schema
//   params() -> { mathComputation, mathMode, mathEngines, mathTimeoutMs, mathPackages, mathInstallScope }
//   projectRoot() / designator / writeText / readText / exists / listDir
//   resolveExecutable(cmd) / spawn({argv,cwd,timeoutMs,stdoutCap,stderrCap}) -> {exit,timedOut,killed,ms,stdout,stderr}
//   log(kind, msg)
//
// Until now the vmu kernel only reached this module through a TEST fake, so `vmu.math.*` and the inherited
// `math_computation` tool were unreachable in a real session (docs/03 §3.1 said so). This adapter builds the
// seam from the host and from the resolved settings, which is what makes those keys real.
//
// Two honest boundaries:
//   · file access is resolved UNDER the project root and a path that escapes it is refused by name (the
//     declared write-policy setting in `vmu.safety.*` is still not consulted - it has no consumer yet, and
//     the key's literal must NOT appear in this file: the settings table computes "wired" by literal scan,
//     so naming it here would mark an unread key as wired; docs/11 §6 discipline 12);
//   · without a subprocess service every engine is unavailable and the module reports that itself
//     (MATH_NO_SUBPROCESS / MATH_ENGINE_NOT_FOUND) instead of pretending.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'
import { createHostSpawn } from './host-spawn.js'
import { guardWrite } from './kernel/guard.js'

/** Public-interface version of this module's surfaces (docs/03 §7). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/** The host's tool result contract, exactly as the vmu tools already prove it on a live host. */
export const MATH_OUTPUT = Object.freeze({
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
})

/** settings key -> the shared module's parameter name (docs/04 §11 lists them one by one). */
export const MATH_PARAM_MAP = Object.freeze({
  'vmu.math.computation': 'mathComputation',
  'vmu.math.mode': 'mathMode',
  'vmu.math.engines': 'mathEngines',
  'vmu.math.timeoutMs': 'mathTimeoutMs',
  'vmu.math.packages': 'mathPackages',
  'vmu.math.installScope': 'mathInstallScope',
})

export function createHostMath({ ctx, settings = {}, projectRoot = null, log = () => {} } = {}) {
  // ★★★ ROUND 202 (measured on the clean-room host): reading an UN-INJECTED service off a cordis context THROWS
  // (`cannot get property "workspace" without inject`). This line used to read `ctx.workspace` directly, so the
  // whole math adapter threw during assembly, the entry caught it (correctly) and set `host = null` — and every
  // member then saw `hostInjected:false`, i.e. "math was never declared", for a deployment that HAD declared it.
  // A reader that may be absent must be probed, not assumed: the fallback chain is projectRoot → ctx.workspace →
  // process.cwd(), and an absent/unreadable service simply loses its turn in that chain.
  const ctxWorkspace = (() => {
    try { return ctx && typeof ctx.workspace === 'string' && ctx.workspace ? ctx.workspace : null } catch { return null }
  })()
  const root = projectRoot || ctxWorkspace || process.cwd()
  // ★★★ G1 / ROUND 82: THIS ADAPTER IS ONLY BUILT WHEN MATH IS DECLARED, so the declaration IS the permission for
  // the local child_process fallback: a host with no `subprocess` service can still compute. The seam still names
  // which path ran (`seamKind`), and the HOST service always wins when it exists.
  const seam = createHostSpawn({ ctx, defaultCwd: root, settings, root, localFallback: true })
  const subprocessOf = () => { try { return ctx && typeof ctx.get === 'function' ? ctx.get('subprocess') : null } catch { return null } }

  /** Resolve a module-supplied (project-relative) path; the DECISION comes from the resolved policy. */
  const under = (rel) => {
    const p = isAbsolute(String(rel)) ? normalize(String(rel)) : normalize(join(root, String(rel)))
    try {
      guardWrite({ settings, root, target: p, kind: 'math surface path' })
    } catch (e) {
      if (e && e.code === 'VMU_NOT_PERMITTED') {
        // Keep the historical wording (callers/tests quote it) and carry the policy hint from the guard.
        throw refuse('VMU_NOT_PERMITTED', 'the math surface refuses a path outside the project root: ' + String(rel), e.hint)
      }
      throw e
    }
    return p
  }

  // ★★★ ROUND 202 (measured in the clean-room host): the shared module reaches the host through TWO callers —
  // `createHostMath` publishes the tool once at assembly, and `createMathSurface` (kernel/math.js) calls
  // `registerMathComputation(host)` which publishes AGAIN through this same adapter. The second publication hit the
  // host's "tool ... is already registered in this scope" refusal, and that refusal surfaced on an ordinary
  // `vibe_vmu_mathtools {action:"run"}` receipt — a read of the surface looked like a broken tool. Publication is
  // therefore IDEMPOTENT BY NAME: the first caller publishes, later callers REUSE the handle, and the reuse is
  // counted so `status.math` can say how many publishers reached the same name.
  const published = new Map()
  let reusedPublications = 0
  const host = {
    /** Register the module's tool with the HOST, in the exact shape the live host accepts. */
    register(name, description, parameters, handler) {
      if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host context has no tools.register: the math tool cannot be published')
      }
      if (published.has(name)) {
        reusedPublications += 1
        log('the shared math tool was already published; reusing the existing handle: ' + name)
        return { ok: true, name, reused: true }
      }
      const schema = Object.assign({ type: 'object', properties: {} }, parameters || {})
      // Minimal normalisation only: the shared module already ships a host-shaped schema, so it is passed
      // through (re-deriving it would mangle the nested `cli` schema).
      if (typeof schema.additionalProperties !== 'boolean') schema.additionalProperties = false
      if (!Array.isArray(schema.required)) schema.required = []
      const spec = {
        name,
        description,
        parameters: schema,
        output: MATH_OUTPUT,
        execute: async (args) => JSON.stringify(await handler(args || {})),
      }
      const doRegister = () => ctx.tools.register(spec)
      if (typeof ctx.effect === 'function') ctx.effect(doRegister, 'vmu:math-tool:' + name)
      else doRegister()
      published.set(name, spec)
      log('registered the shared math tool with the host: ' + name)
      return { ok: true, name }
    },
    /** Has this adapter already published `name`? Callers that would publish a second time ask FIRST. */
    hasTool(name) { return published.has(name) },
    /** Names this adapter has published (a receipt reading, not a guess). */
    publishedNames() { return [...published.keys()] },
    /** How many would-be publishers were folded into an existing handle. */
    reuseCount() { return reusedPublications },
    params() {
      const out = {}
      for (const [key, param] of Object.entries(MATH_PARAM_MAP)) {
        if (settings[key] !== undefined) out[param] = settings[key]
      }
      // ROUND 215: these two are read and VALIDATED here, with literal accesses, for two reasons. The shared module
      // consumes them through `params()` but a computed `settings[key]` is invisible to the settings table's literal
      // scan, and that table is a GATE - so the carrier must be visible to it (the same discipline this file's header
      // records for `vmu.safety.*`). And a malformed value used to be silently defaulted downstream; at the boundary it
      // is now refused BY NAME, which is what makes the setting's contract checkable.
      const rawPackages = settings['vmu.math.packages']
      if (rawPackages !== undefined) {
        if (!Array.isArray(rawPackages) || rawPackages.some((x) => typeof x !== 'string')) {
          throw refuse('VMU_INVALID_ARGUMENT', 'vmu.math.packages must be a list of package names',
            'pass { packages: [\'pkg\', …] } (vmu.math.packages)')
        }
        out.mathPackages = rawPackages.map((x) => String(x).trim()).filter(Boolean)
      }
      const rawScope = settings['vmu.math.installScope']
      if (rawScope !== undefined) {
        if (rawScope !== 'user' && rawScope !== 'system') {
          throw refuse('VMU_INVALID_ARGUMENT', 'vmu.math.installScope must be user or system',
            'pass installScope: \'user\' | \'system\' (vmu.math.installScope; system applies to that call only and is never persisted)')
        }
        out.mathInstallScope = rawScope
      }
      return out
    },
    projectRoot: () => root,
    designator: 'vibe-math-vmu',
    writeText: async (rel, text) => { const p = under(rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, String(text), 'utf8'); return true },
    // ROUND 3 / task-20 (v5r-reader-b's task-19): the EXCLUSIVE-CREATE seam the job mirror needs so "a job id that is
    // already taken" is never overwritten. `flag:'wx'` is O_CREAT|O_EXCL (Windows CREATE_NEW), so an existing file makes
    // the write THROW `EEXIST` instead of replacing it - exactly what the caller maps to `VMU_MATH_JOB_ID_TAKEN` before
    // deleting its own half-written job. The path policy is the same `under()` as every access here, so it cannot
    // escape the root either.
    writeTextExclusive: async (rel, text) => { const p = under(rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, String(text), { encoding: 'utf8', flag: 'wx' }); return true },
    readText: async (rel) => { try { return readFileSync(under(rel), 'utf8') } catch { return undefined } },
    exists: async (rel) => { try { return existsSync(under(rel)) } catch { return false } },
    listDir: async (rel) => {
      try {
        return readdirSync(under(rel), { withFileTypes: true })
          .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
      } catch { return [] }
    },
    // ROUND 2 (task-14, reader-b's correction 2): the math-job MIRROR's eviction seam. Without `removeText` the job
    // face can only STOP writing at `keepMirrors` and count (`mirrorSkipped`) - which is honest but leaves the mirror
    // growing until that cap. With it, the declared cap really evicts the oldest (`droppedMirrors` counts it). The path
    // goes through the same `under()` policy as every other file access here, so a mirror can never escape the root.
    removeText: async (rel) => { try { rmSync(under(rel), { force: true }); return true } catch { return false } },
    hasSubprocess: () => !!subprocessOf(),
    resolveExecutable: async (cmd) => {
      // Resolved AT CALL time through the host's service (a plugin can apply before it mounts: docs/11 §8).
      const sub = subprocessOf()
      if (!sub || typeof sub.resolveExecutable !== 'function') {
        // G1: NO HOST RESOLVER IS NOT "NO ENGINE". The local seam does not scrub PATH the way the host does, so the
        // honest answer is the name itself: the engine probe then really runs it and a missing program comes back as
        // a named ENOENT (VMU_ENGINE_UNAVAILABLE with commandNotFound), instead of this layer PRETENDING to know.
        return String(cmd)
      }
      const p = await sub.resolveExecutable(String(cmd))
      if (typeof p !== 'string' || p.length === 0) throw refuse('VMU_ENGINE_UNAVAILABLE', 'cannot resolve engine ' + String(cmd))
      return p
    },
    spawn: async ({ argv = [], cwd = null, timeoutMs = 0 } = {}) => {
      if (!Array.isArray(argv) || argv.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an argv')
      // ★★ G1 (found while wiring the fallback): `timeoutMs || 0` turned an ABSENT budget into an EXPLICIT ZERO,
      // and `timeoutMs: 0` is a legal "kill immediately" budget at the seam - so a math run with no budget was
      // killed at 0 ms and reported `timedOut:true, killed:true, exit:null` (measured). Absent stays absent here;
      // only a positive integer is handed down as a budget.
      const budget = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined
      const out = await seam({ file: argv[0], args: argv.slice(1), cwd: cwd || root, ...(budget === undefined ? {} : { timeoutMs: budget }) })
      return { exit: out.code, timedOut: !!out.timedOut, killed: !!out.timedOut, ms: out.ms, stdout: out.stdout, stderr: out.stderr,
        // WHICH MECHANISM RAN (G1): two paths, one contract - a receipt must be able to tell them apart.
        seamKind: out.seamKind || null }
    },
    log: (kind, msg) => log('math/' + String(kind) + ': ' + String(msg)),
    /** G1: which spawn mechanism this adapter would use RIGHT NOW (`host-subprocess` | `local-child-process` | null). */
    seamKindOf: () => (typeof seam.seamKindOf === 'function' ? seam.seamKindOf() : null),
  }

  return host
}
