// vmu script bridge — running M3 scripts and workflows (docs/05 §6.2).
//
// A script is how a pack expresses a MULTI-STEP procedure (fan out, fan in, aggregate) that would be
// awkward as a rule or a module. The bridge's contract is narrow on purpose:
//   · the subprocess seam is INJECTED; without it a run is refused by name (docs/11 §4.1). The bridge
//     never reaches into the host, exactly like every other capability here;
//   · a run must return a STRUCTURED result (JSON with at least an `ok` field). Free-form stdout is
//     refused by name, because "we will parse it later" is how pipelines rot;
//   · a non-zero exit is a RESULT, not an exception: the caller's failure policy decides what to do, and
//     the refusal carries the exit code. Only a timeout is a hard, named failure (VMU_JOB_TIMEOUT);
//   · SCRIPT RESULTS NEVER ENTER THE PROMPT BY THEMSELVES. This module has no prompt surface at all: it
//     returns the structured result to the caller, and an explicit `appendPrompt` action (M1) is the only
//     way anything reaches a prompt (docs/06 §5, docs/05 §6.2);
//   · dry-run really does not run: it validates the request and returns the planned command, so "what
//     would this do" is answerable without side effects.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The failure policies an M3 entry may declare (docs/05 §7). */
export const FAILURE = Object.freeze({ OPEN: 'open', CLOSED: 'closed', ABORT: 'abort' })

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/** Validate a run request before anything is executed. Returns a list of problems. */
export function validateRequest(request) {
  const problems = []
  if (!request || typeof request !== 'object') return ['a script request must be an object']
  const hasFile = typeof request.file === 'string' && request.file.length > 0
  const hasInline = typeof request.inline === 'string' && request.inline.length > 0
  if (!hasFile && !hasInline) problems.push('either file or inline is required')
  if (hasFile && hasInline) problems.push('file and inline are mutually exclusive')
  if (request.args !== undefined && (!Array.isArray(request.args) || request.args.some((a) => typeof a !== 'string'))) {
    problems.push('args must be a list of strings')
  }
  if (request.timeoutMs !== undefined && (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 0)) {
    problems.push('timeoutMs must be an integer >= 0 (0 = the bridge default)')
  }
  if (request.failure !== undefined && !Object.values(FAILURE).includes(request.failure)) {
    problems.push('failure must be open|closed|abort')
  }
  if (request.cwd !== undefined && typeof request.cwd !== 'string') problems.push('cwd must be a string')
  if (request.env !== undefined && (typeof request.env !== 'object' || Array.isArray(request.env))) problems.push('env must be an object')
  return problems
}

/**
 * Create the bridge. `spawn` is the injected subprocess seam and must return
 * `{ code, stdout, stderr, timedOut?, ms? }`; `defaultTimeoutMs` applies when a request omits one.
 */
export function createScriptBridge({ spawn = null, defaultTimeoutMs = 60_000, dryRun = false, clock = () => new Date().toISOString() } = {}) {
  const stats = { runs: 0, failures: 0, timeouts: 0, refusals: 0, dryRuns: 0 }
  const history = []

  const record = (row) => {
    const entry = Object.assign({ at: clock() }, row)
    history.push(entry)
    return entry
  }

  const parseResult = (stdout, label) => {
    const text = String(stdout === undefined || stdout === null ? '' : stdout).trim()
    if (text.length === 0) throw refuse('VMU_INVALID_ARGUMENT', label + ' produced no output: an M3 script must print a structured result')
    let parsed
    try { parsed = JSON.parse(text) } catch (e) {
      throw refuse('VMU_INVALID_ARGUMENT', label + ' did not print JSON: ' + String(e && e.message),
        'a script result must be a JSON object with at least { ok } (docs/05 §6.2)')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.ok !== 'boolean') {
      throw refuse('VMU_INVALID_ARGUMENT', label + ' printed JSON without a boolean `ok` field',
        'structured means at least { ok: true|false, summary?, findings? }')
    }
    const shadow = { ok: parsed.ok, summary: parsed.summary === undefined ? null : String(parsed.summary),
      findings: Array.isArray(parsed.findings) ? parsed.findings.slice() : [], data: parsed.data === undefined ? null : parsed.data }
    return shadow
  }

  const bridge = {
    validate: validateRequest,

    /** Plan a run without executing it (this is the dry-run, and it calls no seam). */
    plan(request) {
      const problems = validateRequest(request)
      if (problems.length > 0) {
        stats.refusals++
        return { ok: false, problems }
      }
      const argv = request.file ? { file: request.file, args: (request.args || []).slice() }
        : { inline: '(inline source)', args: (request.args || []).slice() }
      return { ok: true, problems: [], plan: { argv, cwd: request.cwd || null, timeoutMs: request.timeoutMs || defaultTimeoutMs,
        env: Object.keys(request.env || {}).sort() }, runs: false }
    },

    /**
     * Run one script. Returns a structured result; a non-zero exit comes back as a result (with the
     * caller's failure policy applied), while a timeout is a hard, named failure.
     */
    async run(request) {
      const problems = validateRequest(request)
      if (problems.length > 0) {
        stats.refusals++
        throw refuse('VMU_INVALID_ARGUMENT', 'invalid M3 request: ' + problems.join('; '),
          'see docs/05 §6.2 for the accepted shape')
      }
      const label = request.file ? 'script ' + request.file : 'inline script'
      if (dryRun) {
        stats.dryRuns++
        const planned = bridge.plan(request)
        record({ what: 'script-dry-run', label, plan: planned.plan })
        return { ok: true, dryRun: true, ran: false, plan: planned.plan }
      }
      if (typeof spawn !== 'function') {
        stats.refusals++
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no subprocess seam is bound',
          'inject { spawn } - the bridge never reaches into the host (docs/11 §4.1)')
      }
      const timeoutMs = request.timeoutMs || defaultTimeoutMs
      const failure = request.failure || FAILURE.OPEN
      let raw
      try {
        raw = await spawn({ file: request.file || null, inline: request.inline || null, args: (request.args || []).slice(),
          cwd: request.cwd || null, env: Object.assign({}, request.env || {}), timeoutMs })
      } catch (e) {
        stats.failures++
        record({ what: 'script-threw', label, error: String(e && e.message) })
        // The spawn seam carries the HOST STACK and the exact request shape (task-33's fix). They must SURVIVE
        // this rewrite: independent verification (task-34) proved with an injected seam that dropping them here
        // made the live failure undiagnosable, because the tool face can only forward fields the error has.
        const err = refuse('VMU_MIDDLEWARE_FAILED', label + ' could not be started: ' + String(e && e.message),
          'the host refused to spawn it; hostStack/shape carry the host own evidence when it provides one')
        err.hostStack = (e && e.hostStack) || null
        err.shape = (e && e.shape) || null
        err.cause = e
        throw err
      }
      stats.runs++
      if (!raw || raw.timedOut === true) {
        stats.timeouts++
        record({ what: 'script-timeout', label, timeoutMs })
        throw refuse('VMU_JOB_TIMEOUT', label + ' exceeded ' + timeoutMs + 'ms and was terminated',
          'raise timeoutMs or make the script resumable')
      }
      const exit = Number.isInteger(raw.code) ? raw.code : null
      if (exit !== 0) {
        stats.failures++
        const row = record({ what: 'script-failed', label, exit, policy: failure })
        if (failure === FAILURE.ABORT) {
          const err = refuse('VMU_MIDDLEWARE_FAILED', label + ' exited ' + exit + ' (abort policy)', 'the caller must end the turn or stage')
          err.aborted = true
          throw err
        }
        return { ok: false, ran: true, exit, policy: failure, timedOut: false,
          stderr: String(raw.stderr || '').slice(0, 2000), trace: row.at }
      }
      const parsed = parseResult(raw.stdout, label)
      record({ what: 'script-ran', label, exit: 0, ok: parsed.ok })
      return Object.assign({ ran: true, exit: 0, policy: failure, timedOut: false }, parsed)
    },

    /** Observability (R11): what ran, what failed, and the standing promise about prompts. */
    status() {
      return {
        dryRun,
        defaultTimeoutMs,
        hasSpawnSeam: typeof spawn === 'function',
        stats: Object.assign({}, stats),
        recent: history.slice(-10).map((h) => Object.assign({}, h)),
        promptSurface: false,
        note: 'M3 results are returned to the caller only; nothing here can reach a prompt, and only an explicit M1 prompt action injects text (docs/06 §5).',
      }
    },

    history() { return history.map((h) => Object.assign({}, h)) },
  }

  return bridge
}
