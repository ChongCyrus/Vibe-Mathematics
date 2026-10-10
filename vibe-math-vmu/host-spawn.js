// vmu host spawn — the bridge between the host's subprocess service and the vmu script bridge (M3).
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

export const DEFAULT_STDOUT_CAP = 1 << 20 // 1 MiB
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
  delay = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  // The service is resolved AT CALL TIME, not at construction: the live run showed that a plugin's apply()
  // can run before the host's subprocess service is mounted, and binding "no service" at that instant made
  // every script run refuse forever (VMU_ENGINE_UNAVAILABLE) although the service was there a moment later.
  const subprocessOf = () => {
    try { return ctx && typeof ctx.get === 'function' ? ctx.get('subprocess') : null } catch { return null }
  }

  return async function spawnSeam(request = {}) {
    const sub = subprocessOf()
    if (!sub || typeof sub.spawn !== 'function') {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host exposes no subprocess service, so no spawn seam is bound',
        'the script bridge refuses by name in that deployment (the older preset reports NO_SUBPROCESS)')
    }
    const started = clock()
    const budget = Number.isInteger(request.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : null
    const argv = []
    if (typeof request.file === 'string' && request.file.length > 0) argv.push(request.file)
    else if (typeof request.inline === 'string' && request.inline.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'an inline script cannot be spawned by argv: give a file',
        'the host spawns executables, not evaluated text')
    }
    for (const a of request.args || []) argv.push(String(a))
    if (argv.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a spawn needs an executable to run')

    // RESOLVE argv[0] FIRST: the host's own working preset does exactly this (`sub.resolveExecutable(cmd)`
    // returns a string path which then becomes argv[0]). Spawning an unresolved bare name made the host
    // throw inside its resolution path ("Cannot read properties of undefined (reading 'includes')").
    if (typeof sub.resolveExecutable === 'function') {
      try {
        const resolved = await sub.resolveExecutable(String(argv[0]))
        if (typeof resolved === 'string' && resolved.length > 0) argv[0] = resolved
      } catch (e) {
        const shape = { phase: 'resolveExecutable', argv0: String(argv[0]), argvLen: argv.length }
        const sum = shapeSummary(shape)
        const err = refuse('VMU_ENGINE_UNAVAILABLE', 'cannot resolve executable ' + argv[0] + ': ' + String((e && e.message) || e) +
          ' | shape=' + sum.text + (sum.droppedChars ? ' (+' + sum.droppedChars + ' chars omitted)' : ''),
          'the host resolves executables against its scrubbed PATH; an unresolvable command is a named failure')
        err.hostStack = (e && e.stack) || null
        err.shape = shape
        err.cause = e
        throw err
      }
    }

    let handle
    try {
      handle = sub.spawn({
        argv,
        cwd: request.cwd || defaultCwd || undefined,
        stdio: { stdin: 'ignore', stdout: { maxBytes: stdoutCapBytes }, stderr: { maxBytes: stderrCapBytes } },
        ...(budget ? { graceMs: budget } : {}),
        ...(request.env && Object.keys(request.env).length > 0 ? { env: request.env } : {}),
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
        graceMs: budget || undefined,
        envKeys: request.env ? Object.keys(request.env).length : 0,
      }
      const sum = shapeSummary(shape)
      const err = refuse('VMU_INVALID_ARGUMENT', 'the host refused to spawn: ' + String((e && e.message) || e) +
        ' | shape=' + sum.text + (sum.droppedChars ? ' (+' + sum.droppedChars + ' chars omitted)' : ''),
        'the host validates argv/cwd/env synchronously')
      err.hostStack = (e && e.stack) || null
      err.shape = shape
      err.cause = e
      throw err
    }

    const outcome = await Promise.race([
      Promise.resolve(handle.done).then((v) => ({ settled: true, value: v }), (e) => ({ settled: false, error: e })),
      budget ? delay(budget).then(() => ({ settled: false, timeout: true })) : new Promise(() => {}),
    ])
    const ms = clock() - started
    const text = (side) => { try { const c = handle.collected && handle.collected[side]; return c ? c.readFrom(0).text : '' } catch { return '' } }
    if (outcome.timeout) {
      // Return the shape the bridge turns into VMU_JOB_TIMEOUT; the host's graceMs terminates the process.
      return { code: null, stdout: text('stdout'), stderr: text('stderr'), timedOut: true, ms }
    }
    if (!outcome.settled) {
      throw refuse('VMU_MIDDLEWARE_FAILED', 'the spawn failed: ' + String(outcome.error && outcome.error.message),
        'the host reported an error instead of an outcome')
    }
    return { code: outcome.value && Number.isInteger(outcome.value.exitCode) ? outcome.value.exitCode : null,
      stdout: text('stdout'), stderr: text('stderr'), timedOut: false, ms,
      signal: (outcome.value && outcome.value.signal) || null }
  }
}
