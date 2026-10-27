// vmu host spawn — the bridge between the host's subprocess service and the vmu script bridge (M3).
//
// ★★ INVARIANT (Round 30, MEASURED): NO ARGUMENT A CALLER CAN PASS MAY KILL THE HOST. A tool handler runs inside
// the host process, so an uncaught throw is not "a failed call" - it is `fatal load failure` and the server dies.
// Measured case: `request.args` was a non-iterable object, `for (const a of request.args || [])` threw
// `TypeError: object is not iterable`, and the process went down (host-spawn.js:104 via kernel/mathtools.js:630).
// Therefore every value that arrives from a CALLER is validated before it is iterated, spread or destructured, and
// the failure is a NAMED refusal (`VMU_INVALID_ARGUMENT` with a hint), never a raw throw.
//
// The script bridge takes an INJECTED spawn seam (docs/05 §6.2, docs/11 §4.1). This module builds that seam
// from the host, using the API this repository's own working preset uses (vibe-math-v5r.js:4429-4485):
//
//   const sub = ctx.get('subprocess')
//   const handle = sub.spawn({ argv, cwd, stdio: { stdin:'ignore', stdout:{maxBytes}, stderr:{maxBytes} }, graceMs })
//   const outcome = await handle.done                       // { exitCode, signal }
//   const text = handle.collected.stdout.readFrom(0).text   // collected output
//
// Two honest rules:
//   · with no subprocess service the seam is NOT invented: every run is refused by name upstream
//     (VMU_ENGINE_UNAVAILABLE), exactly as `NO_SUBPROCESS` works in the older preset;
//   · a budget expiry is reported as `timedOut: true` for the bridge to turn into VMU_JOB_TIMEOUT, and the
//     budget is ALSO handed to the host as `graceMs` so the process is actually terminated.
//
// Output caps are generous on purpose: the collected reader caps what it keeps, so a too-small cap would
// silently truncate a receipt (the older preset learned this the hard way).

import { spawn as nodeSpawn } from 'node:child_process'
import { guardSpawnCwd } from './kernel/guard.js'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/**
 * Diagnostic shape summary for a failed spawn (issue #13 / M3): the LIVE host failure had no stack because
 * this seam dropped it. This builds a bounded, countable summary of what was ACTUALLY passed, so a refusal
 * carries both the host stack and the real shape. It never truncates silently: the omitted character count
 * is reported (the same rule the readers follow).
 */
export function shapeSummary(shape, cap = 400) {
  let text
  try { text = JSON.stringify(shape) } catch (e) { text = '{"unserializable":' + JSON.stringify(String((e && e.message) || e)) + '}' }
  if (typeof text !== 'string') text = String(text)
  if (text.length <= cap) return { text, droppedChars: 0 }
  return { text: text.slice(0, cap), droppedChars: text.length - cap }
}

// The name a receipt uses for the fallback path (G1). Two mechanisms must never be blended silently.
export const LOCAL_SEAM_KIND = 'local-child-process'

export const DEFAULT_STDOUT_CAP = 1 << 20 // 1 MiB
// ROUND 4 / task-25: the module's OWN delay, so the budget race can tell "the default (cancellable here)" from "an
// injected delay (driven by the caller, as the timer tests do)".
export const DEFAULT_DELAY = (ms) => new Promise((r) => setTimeout(r, ms))
export const DEFAULT_STDERR_CAP = 1 << 20

/** Is the host able to spawn at all? (pure - the caller decides whether to bind the seam) */
export function hasHostSpawn(ctx) {
  try {
    const sub = ctx && typeof ctx.get === 'function' ? ctx.get('subprocess') : null
    return !!(sub && typeof sub.spawn === 'function')
  } catch { return false }
}

/**
 * Build the spawn seam. `now` and `delay` are injectable so the timeout path is testable without waiting.
 */
export function createHostSpawn({
  ctx,
  defaultCwd = null,
  stdoutCapBytes = DEFAULT_STDOUT_CAP,
  stderrCapBytes = DEFAULT_STDERR_CAP,
  clock = () => Date.now(),
  delay = DEFAULT_DELAY,
  // The path policy needs its two inputs to reach the spawn surface (docs/04 §11). Both default to absent, and
  // the guard is only consulted when a root is known - so a seam built without them behaves exactly as before.
  settings = {},
  root = null,
  // G1: a caller that DECLARED computation/scripts may ask for the local child_process path when the host has no
  // subprocess service. Default false: silence keeps the conservative named refusal (see the seam's first branch).
  localFallback = false,
} = {}) {
  // The service is resolved AT CALL TIME, not at construction: the live run showed that a plugin's apply()
  // can run before the host's subprocess service is mounted, and binding "no service" at that instant made
  // every script run refuse forever (VMU_ENGINE_UNAVAILABLE) although the service was there a moment later.
  const subprocessOf = () => {
    try { return ctx && typeof ctx.get === 'function' ? ctx.get('subprocess') : null } catch { return null }
  }
  // ROUND 4: the budget-timer cleanup ledger (see the race below). Named errors, not swallowed ones.
  const timerCleanupErrors = []

  // ROUND 6 / target-5 (v5r-reader-b's ruling): THE SAME SEAM IS ALSO THE KILLABLE ONE. The job faces accept
  // `spawnHandle(opts, onHandle)` and expect the HANDLE synchronously so `cancel({jobId})` can call `terminate()`
  // immediately (without it they can only refuse by name: "this seam cannot kill"). One implementation, two call
  // shapes: `spawn(request)` and `spawn(request, (handle) => …)`.
  // ★ PHASE 9 / round 7: the real machine returned `hadHandle:true, exitCode:undefined` while the host's own header
  // says `done -> { exitCode, signal }`. Do NOT assume the field name: try the shapes this repo has seen and CARRY the
  // raw resolved value + the handle's keys, so the next run can distinguish empty/renamed/Promise-wrapped outcomes.
  const safeValueText = (v) => {
    try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.slice(0, 1000) } catch { return String(v).slice(0, 1000) }
  }
  const handleKeysOf = (h) => { try { return Object.keys(h || {}).slice(0, 40) } catch { return [] } }
  const exitCodeOf = (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'number') return Number.isInteger(v) ? v : null
    if (typeof v !== 'object') return null
    for (const k of ['exitCode', 'code', 'status', 'exit']) {
      const n = v[k]
      if (typeof n === 'number' && Number.isInteger(n)) return n
    }
    return null
  }
  // ---- G1: THE LOCAL FALLBACK SEAM -------------------------------------------------------------------------
  // Same request/result contract as the host path above, so callers (the script bridge and the math adapter) do
  // not know which one ran: that is exactly what `seamKind` is for. What it does NOT share is the host's
  // `resolveExecutable`: there is no host PATH scrubber here, so the name is handed to `node:child_process` and a
  // missing program surfaces as a rejected `done` with `code:'ENOENT'` + `commandNotFound:true`.
  const localSeam = async function localSeam(request = {}, onHandle = null) {
    const started = clock()
    const budget = Number.isInteger(request.timeoutMs) && request.timeoutMs >= 0 ? request.timeoutMs : null
    const exe = typeof request.file === 'string' && request.file.length > 0
      ? request.file
      : (typeof request.command === 'string' && request.command.length > 0 ? request.command : null)
    if (exe === null) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an EXECUTABLE (file/command), not only arguments',
        'pass { file: "<program>", args: [...] } (or command); arguments alone would make argv[0] an argument')
    }
    if (typeof request.inline === 'string' && request.inline.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'an inline script cannot be spawned by argv: give a file',
        'the seam spawns executables, not evaluated text')
    }
    const argList = request.args === undefined || request.args === null ? [] : request.args
    if (!Array.isArray(argList)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'spawn args must be an ARRAY of arguments, got ' + (typeof argList),
        'pass args as an array (e.g. args: ["--version"]); a malformed call is refused instead of killing the host')
    }
    const argv = [exe, ...argList.map((a) => String(a))]
    const cwd = typeof request.cwd === 'string' && request.cwd.length > 0 ? request.cwd
      : (typeof defaultCwd === 'string' && defaultCwd.length > 0 ? defaultCwd : process.cwd())
    // The SAME path policy applies: a cwd outside the declared roots is refused by name before anything runs.
    if (root && typeof settings['vmu.safety.pathPolicy'] === 'string') guardSpawnCwd({ settings, root, cwd })
    const rawEnv = request.env && typeof request.env === 'object' && !Array.isArray(request.env) ? request.env : {}
    const env = {}
    const envDropped = []
    for (const [k, v] of Object.entries(rawEnv)) {
      if (typeof v === 'string') env[k] = v
      else if (typeof v === 'number' || typeof v === 'boolean') env[k] = String(v)
      else envDropped.push(k)
    }
    let child = null
    let settle = null
    const done = new Promise((resolve) => { settle = resolve })
    const out = { stdout: [], outBytes: 0, outDropped: 0 }
    const err = { stdout: [], outBytes: 0, outDropped: 0 }
    const collect = (box, cap) => (chunk) => {
      const text = String(chunk)
      if (box.outBytes >= cap) { box.outDropped += text.length; return }
      const room = cap - box.outBytes
      box.stdout.push(text.slice(0, room))
      box.outBytes += Math.min(room, text.length)
      if (text.length > room) box.outDropped += text.length - room
    }
    const outcome = { exitCode: null, signal: null, spawnError: null, timedOut: false, killed: null }
    try {
      child = nodeSpawn(argv[0], argv.slice(1), {
        cwd,
        env: Object.keys(env).length > 0 ? Object.assign({}, process.env, env) : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (e) {
      const e2 = refuse('VMU_INVALID_ARGUMENT', 'the local seam refused to spawn: ' + String((e && e.message) || e),
        'node:child_process validates argv/cwd synchronously')
      e2.spawnError = { code: (e && e.code) || null, message: String((e && e.message) || e) }
      e2.commandNotFound = (e && e.code === 'ENOENT') || /not found|ENOENT|no such file/i.test(String((e && e.message) || e))
      throw e2
    }
    child.stdout.on('data', collect(out, stdoutCapBytes))
    child.stderr.on('data', collect(err, stderrCapBytes))
    child.on('error', (e) => {
      outcome.spawnError = { code: (e && e.code) || null, message: String((e && e.message) || e) }
      settle()
    })
    child.on('close', (code, signal) => {
      outcome.exitCode = typeof code === 'number' ? code : null
      outcome.signal = signal || null
      settle()
    })
    // THE KILLABLE HALF: the caller gets a handle it can terminate, exactly like the host's.
    const handle = {
      pid: child.pid === undefined ? null : child.pid,
      terminate: () => { try { outcome.killed = 'terminate'; child.kill('SIGKILL') } catch { /* already gone */ } return true },
      kill: (sig) => { try { outcome.killed = String(sig || 'SIGKILL'); child.kill(sig || 'SIGKILL') } catch { /* already gone */ } return true },
      collected: {
        stdout: { readFrom: () => ({ text: out.stdout.join(''), droppedChars: out.outDropped }) },
        stderr: { readFrom: () => ({ text: err.stdout.join(''), droppedChars: err.outDropped }) },
      },
    }
    if (typeof onHandle === 'function') {
      try { onHandle(handle) } catch (e) {
        timerCleanupErrors.push({ code: 'VMU_SPAWN_HANDLE_CALLBACK_FAILED', message: String((e && e.message) || e), at: clock() })
      }
    }
    let timer = null
    const timedOut = await Promise.race([
      done.then(() => false),
      budget === null ? new Promise(() => {}) : new Promise((resolve) => {
        timer = setTimeout(() => { try { outcome.killed = 'budget'; child.kill('SIGKILL') } catch { /* gone */ } resolve(true) }, budget)
        if (timer && typeof timer.unref === 'function') timer.unref()
      }),
    ])
    if (timedOut) { outcome.timedOut = true; await done }
    if (timer !== null) { try { clearTimeout(timer) } catch { /* cleared by exit */ } }
    const ms = clock() - started
    const textOf = (box) => box.stdout.join('')
    // An ENOENT is a NAMED failure, the same way the host path names a failed `resolveExecutable`.
    if (outcome.spawnError && !outcome.timedOut) {
      const e2 = refuse('VMU_ENGINE_UNAVAILABLE', 'cannot run ' + argv[0] + ': ' + outcome.spawnError.message,
        'the local seam hands the program to node:child_process; ENOENT means it is not on this machine')
      e2.resolved = argv[0]
      e2.spawnError = outcome.spawnError
      e2.commandNotFound = outcome.spawnError.code === 'ENOENT'
      e2.seamKind = LOCAL_SEAM_KIND
      throw e2
    }
    return { code: outcome.exitCode, exitCode: outcome.exitCode,
      stdout: textOf(out), stderr: textOf(err), timedOut: outcome.timedOut, ms,
      signal: outcome.signal, resolved: argv[0], doneError: null, spawnError: outcome.spawnError, resolveError: null,
      cwd, path: (typeof process !== 'undefined' && process.env && (process.env.PATH || process.env.Path)) || null,
      doneValue: null, doneShape: outcome.exitCode === null ? 'signal' : 'exitCode', handleKeys: Object.keys(handle),
      killed: outcome.killed, envDropped, seamKind: LOCAL_SEAM_KIND }
  }

  const spawnSeam = async function spawnSeam(request = {}, onHandle = null) {
    const sub = subprocessOf()
    if (!sub || typeof sub.spawn !== 'function') {
      // ★★★ G1 / ROUND 82 (the rules ledger's "计算与工具" limb): THE HOST MAY HAVE NO SUBPROCESS SERVICE AT ALL.
      // The refusal below is the CONSERVATIVE default and stays the default: a deployment that said nothing gets a
      // named refusal, never an invented mechanism. A caller that DECLARED it wants computation (the math face is
      // only built when `vmu.math.*` is declared) or scripts passes `localFallback: true`, and then the same seam
      // runs the child through `node:child_process` with the SAME guards (executable required, args array, cwd
      // policy, output caps, killable handle, budget that really terminates). Every result says which path ran:
      // `seamKind` is `host-subprocess` or `local-child-process` - a receipt must never blend two mechanisms.
      if (!localFallback) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host exposes no subprocess service, so no spawn seam is bound',
          'the script bridge refuses by name in that deployment (the older preset reports NO_SUBPROCESS)')
      }
      return localSeam(request, onHandle)
    }
    const started = clock()
    // ★ PHASE 9 / round 1: REAL spwan-failure evidence, carried on the seam's result/error. Without these the kernel
    // could only say "no exitCode" and could not tell PATH-not-found from a rejected done or a signal.
    let resolvedExe = null
    let doneError = null
    let spawnError = null
    let resolveError = null
    const hostPath = (typeof process !== 'undefined' && process.env && (process.env.PATH || process.env.Path)) || null
    const pathPrefix = hostPath ? String(hostPath).slice(0, 500) : null
    // task-217 (falsy-zero): `timeoutMs: 0` is a LEGAL budget (spawn and time out immediately), so it must not
    // be folded into "not given". `null` = absent/invalid, `0` = an explicit zero budget — the two are distinct.
    const budget = Number.isInteger(request.timeoutMs) && request.timeoutMs >= 0 ? request.timeoutMs : null
    const argv = []
    // ★★ ROUND 37 (measured): THE EXECUTABLE IS REQUIRED, AND IT IS NOT INFERRED FROM THE ARGUMENTS. A caller
    // (`kernel/formal.js:147`) passed `{ command: leanCommand, args: […, '--stdin'] }` while this seam reads `file` -
    // a pure FIELD-NAME MISMATCH, the same family as the chat face's `from`/`by` drift. `file` was undefined, so
    // nothing was pushed, and because `args` were then appended, `argv[0]` became `--stdin`: the host tried to EXECUTE
    // a flag, and the real command was silently ignored. The emptiness guard below could not catch it, because argv
    // was not empty - it was wrong. So the executable is taken from `file` (accepting `command` as an alias, since
    // that is the word callers reach for) and its ABSENCE is refused by name BEFORE anything else is considered.
    const exe = typeof request.file === 'string' && request.file.length > 0
      ? request.file
      : (typeof request.command === 'string' && request.command.length > 0 ? request.command : null)
    if (exe === null) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an EXECUTABLE (file/command), not only arguments'
        + (Array.isArray(request.args) && request.args.length > 0 ? ' - got args starting with ' + JSON.stringify(request.args[0]) : ''),
        'pass { file: "<program>", args: [...] } (or command); arguments alone would make argv[0] an argument, which is how a flag once became the program to execute')
    }
    argv.push(exe)
    if (typeof request.inline === 'string' && request.inline.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'an inline script cannot be spawned by argv: give a file',
        'the host spawns executables, not evaluated text')
    }
    // ★★ A TOOL ARGUMENT MUST NEVER KILL THE SERVER (invariant, see the header). `request.args` comes from the
    // caller, so it is UNTRUSTED: a non-iterable value (e.g. `args: {}`) used to reach `for..of` and throw an
    // UNCAUGHT `TypeError: object is not iterable`, which the host surfaced as `fatal load failure` - the whole
    // server died on one bad tool argument (measured, stack at host-spawn.js:104 via kernel/mathtools.js:630).
    // It is refused BY NAME now, in the same shape as the two refusals around it.
    const argList = request.args === undefined || request.args === null ? [] : request.args
    if (!Array.isArray(argList)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'spawn args must be an ARRAY of arguments, got ' + (typeof argList),
        'pass args as an array (e.g. args: ["--version"]); a malformed call is refused instead of killing the host')
    }
    for (const a of argList) argv.push(String(a))
    if (argv.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an executable to run')

    // RESOLVE argv[0] FIRST: the host's own working preset does exactly this (`sub.resolveExecutable(cmd)`
    // returns a string path which then becomes argv[0]). Spawning an unresolved bare name made the host
    // throw inside its resolution path ("Cannot read properties of undefined (reading 'includes')").
    if (typeof sub.resolveExecutable === 'function') {
      try {
        const resolved = await sub.resolveExecutable(String(argv[0]))
        if (typeof resolved === 'string' && resolved.length > 0) { argv[0] = resolved; resolvedExe = resolved }
      } catch (e) {
        const shape = { phase: 'resolveExecutable', argv0: String(argv[0]), argvLen: argv.length }
        const sum = shapeSummary(shape)
        const err = refuse('VMU_ENGINE_UNAVAILABLE', 'cannot resolve executable ' + argv[0] + ': ' + String((e && e.message) || e) +
          ' | shape=' + sum.text + (sum.droppedChars ? ' (+' + sum.droppedChars + ' chars omitted)' : ''),
          'the host resolves executables against its scrubbed PATH; an unresolvable command is a named failure')
        err.hostStack = (e && e.stack) || null
        err.shape = shape
        err.cause = e
        resolveError = { code: (e && e.code) || null, message: String((e && e.message) || e) }
        err.resolved = null
        err.resolveError = resolveError
        err.commandNotFound = (e && e.code === 'ENOENT') || /not found|ENOENT|no such file/i.test(String((e && e.message) || e))
        err.cwd = null
        err.path = pathPrefix
        throw err
      }
    }

    let handle
    // ENV NORMALISATION — the M3 ROOT CAUSE, found once the bridge stopped swallowing the host stack. The host's
    // own validation calls `.includes` ON EACH ENV VALUE, so a value of `undefined` crashes it BEFORE any handle
    // exists (TypeError: Cannot read properties of undefined (reading 'includes')). Only strings can be
    // environment variables: coerce primitives, DROP the rest, and count what was dropped instead of quietly
    // shipping a shape the host cannot accept.
    const rawEnv = request.env && typeof request.env === 'object' && !Array.isArray(request.env) ? request.env : {}
    const env = {}
    const envDropped = []
    for (const [k, v] of Object.entries(rawEnv)) {
      if (typeof v === 'string') env[k] = v
      else if (typeof v === 'number' || typeof v === 'boolean') env[k] = String(v)
      else envDropped.push(k)
    }
    const envKeys = Object.keys(env).length
    // CWD: the host's `targetEnvironment` validates `options.cwd` through `validateNoNullByte` (which calls
    // `.includes`) and the LIVE evidence shows it throwing there even when the key is OMITTED entirely
    // (p2-m3-stack3: omitting cwd still crashed at runner-launch:1520). That host is public and cannot be
    // patched from here, so the seam always passes a REAL STRING: the caller's cwd, else the configured
    // workspace, else the process cwd. This is a CALLER-SIDE WORKAROUND for a host defect - stated as such,
    // not a fix of the host.
    const cwd = typeof request.cwd === 'string' && request.cwd.length > 0 ? request.cwd
      : (typeof defaultCwd === 'string' && defaultCwd.length > 0 ? defaultCwd : process.cwd())
    // THE PATH POLICY REACHES THE SPAWN SURFACE (docs/04 §11) - OPT-IN, and deliberately so. A spawn cwd is
    // usually the AGENT WORKSPACE, which is not necessarily the kernel's root, so applying the policy's own
    // default here would refuse legitimate spawns (it would have re-broken the M3 path we just fixed). The
    // guard runs only when the configuration DECLARES the policy; then a cwd outside the allowed roots is
    // refused BY NAME before the host is touched.
    if (root && typeof settings['vmu.safety.pathPolicy'] === 'string') guardSpawnCwd({ settings, root, cwd })
    try {
      handle = sub.spawn({
        argv,
        cwd,
        stdio: { stdin: 'ignore', stdout: { maxBytes: stdoutCapBytes }, stderr: { maxBytes: stderrCapBytes } },
        ...(budget !== null ? { graceMs: budget } : {}),
        ...(envKeys > 0 ? { env } : {}),
      })
    } catch (e) {
      // The host validates argv/cwd/env and throws BEFORE a handle exists (documented contract).
      // Issue #13 / M3: carry the HOST STACK and the ACTUAL shape — the earlier seam dropped both, so the
      // live failure was recorded as a NON-RESULT with no stack. Error code and behaviour are unchanged.
      const shape = {
        phase: 'subprocess.spawn',
        argv,
        argvLen: argv.length,
        cwd: request.cwd || defaultCwd || undefined,
        stdio: { stdin: 'ignore', stdout: { maxBytes: stdoutCapBytes }, stderr: { maxBytes: stderrCapBytes } },
        graceMs: budget === null ? undefined : budget,
        envKeys: request.env ? Object.keys(request.env).length : 0,
      }
      const sum = shapeSummary(shape)
      const err = refuse('VMU_INVALID_ARGUMENT', 'the host refused to spawn: ' + String((e && e.message) || e) +
        ' | shape=' + sum.text + (sum.droppedChars ? ' (+' + sum.droppedChars + ' chars omitted)' : ''),
        'the host validates argv/cwd/env synchronously')
      err.hostStack = (e && e.stack) || null
      err.shape = shape
      err.cause = e
      spawnError = { code: (e && e.code) || null, message: String((e && e.message) || e) }
      err.resolved = resolvedExe
      err.spawnError = spawnError
      err.commandNotFound = (e && e.code === 'ENOENT') || /not found|ENOENT|no such file/i.test(String((e && e.message) || e))
      err.cwd = null
      err.path = pathPrefix
      throw err
    }
    // ★ THE KILLABLE HALF: hand the host's handle to the caller BEFORE waiting for it. A throw in the callback must not
    // abort the run (the caller's bookkeeping is its own business), but it must be NAMED rather than swallowed.
    if (typeof onHandle === 'function') {
      try { onHandle(handle) } catch (e) {
        timerCleanupErrors.push({ code: 'VMU_SPAWN_HANDLE_CALLBACK_FAILED', message: String((e && e.message) || e), at: clock() })
        try { process.stderr.write('vmu: the spawn-handle callback failed (VMU_SPAWN_HANDLE_CALLBACK_FAILED): ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
      }
    }

    // ROUND 4 / task-25 (vmu-activity's F15 measurement): the budget timer used to stay ARMED after the process settled
    // first (measured: armed Timeout +1), because `Promise.race` cannot cancel the loser. The DEFAULT timer is created
    // here with its own handle so the settle path can clear it in `finally`; an INJECTED `delay` keeps driving the
    // timeout path exactly as before (the tests use it), and a cancellation failure is NAMED rather than swallowed.
    let budgetTimer = null
    const timeoutOutcome = () => {
      if (delay === DEFAULT_DELAY) {
        return new Promise((resolve) => {
          budgetTimer = setTimeout(() => resolve({ settled: false, timeout: true }), budget)
          if (budgetTimer && typeof budgetTimer.unref === 'function') budgetTimer.unref()
        })
      }
      return Promise.resolve(delay(budget)).then(() => ({ settled: false, timeout: true }))
    }
    try {
      const outcome = await Promise.race([
        Promise.resolve(handle.done).then((v) => ({ settled: true, value: v }), (e) => ({ settled: false, error: e })),
        budget !== null ? timeoutOutcome() : new Promise(() => {}),
      ])
      const ms = clock() - started
      const text = (side) => { try { const c = handle.collected && handle.collected[side]; return c ? c.readFrom(0).text : '' } catch { return '' } }
      if (outcome.timeout) {
        // Return the shape the bridge turns into VMU_JOB_TIMEOUT; the host's graceMs terminates the process.
        return { code: null, exitCode: null, stdout: text('stdout'), stderr: text('stderr'), timedOut: true, ms,
          signal: null, resolved: resolvedExe, doneError, spawnError, resolveError, cwd: null, path: pathPrefix,
          doneValue: null, doneShape: 'timeout-no-resolve', handleKeys: handleKeysOf(handle) }
      }
      if (!outcome.settled) {
        doneError = {
          code: (outcome.error && outcome.error.code) || null,
          message: String((outcome.error && outcome.error.message) || outcome.error),
          signal: (outcome.error && outcome.error.signal) || null,
        }
        const err = refuse('VMU_MIDDLEWARE_FAILED', 'the spawn failed (done rejected): ' + doneError.message,
          'the host reported a rejected done instead of an outcome; the kernel exposes doneError/resolved/cwd/path')
        err.resolved = resolvedExe
        err.doneError = doneError
        err.cwd = null
        err.path = pathPrefix
        throw err
      }
      const value = outcome.value
      const exitCode = exitCodeOf(value)
      return { code: exitCode, exitCode,
        stdout: text('stdout'), stderr: text('stderr'), timedOut: false, ms,
        signal: (value && value.signal) || null,
        resolved: resolvedExe, doneError, spawnError, resolveError, cwd: null, path: pathPrefix,
        doneValue: safeValueText(value), doneShape: exitCode === null ? (value === null || value === undefined ? 'undefined' : typeof value) : 'exitCode',
        handleKeys: handleKeysOf(handle) }
    } finally {
      if (budgetTimer !== null) {
        const t = budgetTimer
        budgetTimer = null
        try { clearTimeout(t) } catch (e) {
          // NAMED, not swallowed: a timer that could not be cleared is a real leak and the caller can see it.
          timerCleanupErrors.push({ code: 'VMU_SPAWN_TIMER_CLEANUP', message: String((e && e.message) || e), at: clock() })
          try { process.stderr.write('vmu: spawn budget timer could not be cleared (VMU_SPAWN_TIMER_CLEANUP): ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
        }
      }
    }
  }
  // The cleanup ledger travels on the seam, so "was the budget timer ever leaked" is answerable from outside.
  spawnSeam.timerCleanupErrors = timerCleanupErrors
  // WHICH seam would run RIGHT NOW (asked per call, because the host's service can mount later).
  spawnSeam.seamKindOf = () => (hasHostSpawn(ctx) ? 'host-subprocess' : (localFallback ? LOCAL_SEAM_KIND : null))
  return spawnSeam
}
