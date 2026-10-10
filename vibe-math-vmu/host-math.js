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

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
  const root = projectRoot || (ctx && typeof ctx.workspace === 'string' && ctx.workspace) || process.cwd()
  const seam = createHostSpawn({ ctx, defaultCwd: root })
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

  const host = {
    /** Register the module's tool with the HOST, in the exact shape the live host accepts. */
    register(name, description, parameters, handler) {
      if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host context has no tools.register: the math tool cannot be published')
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
      log('registered the shared math tool with the host: ' + name)
      return { ok: true, name }
    },
    params() {
      const out = {}
      for (const [key, param] of Object.entries(MATH_PARAM_MAP)) {
        if (settings[key] !== undefined) out[param] = settings[key]
      }
      return out
    },
    projectRoot: () => root,
    designator: 'vibe-math-vmu',
    writeText: async (rel, text) => { const p = under(rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, String(text), 'utf8'); return true },
    readText: async (rel) => { try { return readFileSync(under(rel), 'utf8') } catch { return undefined } },
    exists: async (rel) => { try { return existsSync(under(rel)) } catch { return false } },
    listDir: async (rel) => {
      try {
        return readdirSync(under(rel), { withFileTypes: true })
          .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
      } catch { return [] }
    },
    hasSubprocess: () => !!subprocessOf(),
    resolveExecutable: async (cmd) => {
      // Resolved AT CALL time through the host's service (a plugin can apply before it mounts: docs/11 §8).
      const sub = subprocessOf()
      if (!sub || typeof sub.resolveExecutable !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host exposes no subprocess service: no engine can be resolved')
      }
      const p = await sub.resolveExecutable(String(cmd))
      if (typeof p !== 'string' || p.length === 0) throw refuse('VMU_ENGINE_UNAVAILABLE', 'cannot resolve engine ' + String(cmd))
      return p
    },
    spawn: async ({ argv = [], cwd = null, timeoutMs = 0 } = {}) => {
      if (!Array.isArray(argv) || argv.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an argv')
      const out = await seam({ file: argv[0], args: argv.slice(1), cwd: cwd || root, timeoutMs: timeoutMs || 0 })
      return { exit: out.code, timedOut: !!out.timedOut, killed: !!out.timedOut, ms: out.ms, stdout: out.stdout, stderr: out.stderr }
    },
    log: (kind, msg) => log('math/' + String(kind) + ': ' + String(msg)),
  }

  return host
}
