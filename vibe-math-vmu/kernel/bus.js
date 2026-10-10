// vmu hook bus — one place where middleware meets the framework (docs/05).
//
// The bus exists so that middleware authors never have to know DSH's rules:
//   · waterfall listeners MUST call next() or they silently veto the whole chain (including built-in
//     behaviour). `wrapHostWaterfall` owns that contract, so a vmu handler that merely returns
//     undefined always lets the chain continue;
//   · every entry declares its capabilities; using one it did not declare is a named refusal, not a
//     surprise (docs/05 §6);
//   · failures are three-state (open / closed / abort) and ALWAYS audited; consecutive failures trip a
//     breaker that disables the entry instead of letting it drag the whole institute down (docs/05 §7);
//   · scope decides who a hook applies to (member / role / phase), and ordering is deterministic
//     (order, then id) so two runs of the same configuration behave identically (docs/05 §2).
//
// No host imports: plain Node must be able to import this module in this repository (see the same note
// in settings/schema.js and kernel/store.js).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Failure policies (docs/05 §7). */
export const FAILURE = Object.freeze({ OPEN: 'open', CLOSED: 'closed', ABORT: 'abort' })

/** The capability vocabulary. A decision may only use what its entry declared (docs/05 §5.3, §6). */
export const CAPABILITIES = Object.freeze([
  'read-state', 'read-args', 'deny', 'cancel', 'rewrite-args', 'rewrite-result',
  'append-prompt', 'record', 'notify', 'set-setting', 'trigger-workflow', 'annotate',
])

/** decision key -> the capability it consumes */
const DECISION_CAPABILITY = Object.freeze({
  deny: 'deny',
  cancel: 'cancel',
  rewriteArgs: 'rewrite-args',
  rewriteResult: 'rewrite-result',
  appendPrompt: 'append-prompt',
  record: 'record',
  notify: 'notify',
  setSetting: 'set-setting',
  triggerWorkflow: 'trigger-workflow',
  annotate: 'annotate',
})

/** vmu-internal hook names (docs/05 §4.2). The host substrate names live in docs/05 §4.1. */
export const VU_HOOKS = Object.freeze([
  'member/wake-before', 'member/wake-after', 'turn/reply-parsed',
  'meeting/round-start', 'meeting/round-end', 'ballot/cast', 'ballot/tally',
  'record/append-before', 'record/appended', 'task/assign', 'task/transition',
  'prompt/section-assembled', 'budget/exceeded', 'pack/loading', 'pack/loaded',
  'settle/before', 'settle/after',
  'control/paused', 'control/resumed', 'control/heartbeat',
])

/**
 * Bus topics that are NOT vmu hooks: the host-waterfall bridge publishes the DSH waterfall under this name (and
 * passes the host's own hook name through) so middleware can observe/steer it. Kept SEPARATE from `VU_HOOKS`
 * because the docs' hook table is the vmu-internal contract, while these are bridge topics (docs/05 §4.1 vs §4.2).
 */
export const BRIDGE_TOPICS = Object.freeze(['host/waterfall'])

/** Default failure policy per hook, so an entry that omits one still behaves safely (docs/05 §4.3). */
export const DEFAULT_FAILURE = Object.freeze({
  'member/wake-before': 'closed', 'member/wake-after': 'closed', 'turn/reply-parsed': 'closed',
  'meeting/round-start': 'closed', 'meeting/round-end': 'closed',
  'ballot/cast': 'closed', 'ballot/tally': 'closed',
  'record/append-before': 'closed', 'record/appended': 'open',
  'task/assign': 'closed', 'task/transition': 'closed',
  'prompt/section-assembled': 'open',
  'budget/exceeded': 'abort',
  'pack/loading': 'closed', 'pack/loaded': 'closed',
  'settle/before': 'closed', 'settle/after': 'closed',
  // Control flow is OBSERVATION for middleware (a watcher may react), so the framework keeps running when a
  // listener fails: an open policy here is what stops a broken watcher from freezing the whole run.
  'control/paused': 'open', 'control/resumed': 'open', 'control/heartbeat': 'open',
})

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** Static validation of one entry (docs/05 §9 step 1). Returns a list of problems; empty means OK. */
export function validateEntry(entry) {
  const problems = []
  if (!entry || typeof entry !== 'object') return ['entry must be an object']
  if (typeof entry.id !== 'string' || entry.id.length === 0) problems.push('id is required')
  if (!['rules', 'module', 'script', 'plugin'].includes(entry.kind)) problems.push('kind must be rules|module|script|plugin')
  const on = Array.isArray(entry.on) ? entry.on : [entry.on]
  if (on.length === 0 || on.some((h) => typeof h !== 'string' || h.length === 0)) problems.push('on must name at least one hook')
  if (entry.failure !== undefined && !Object.values(FAILURE).includes(entry.failure)) problems.push('failure must be open|closed|abort')
  if (entry.order !== undefined && !Number.isInteger(entry.order)) problems.push('order must be an integer')
  if (entry.capabilities !== undefined) {
    if (!Array.isArray(entry.capabilities)) problems.push('capabilities must be a list')
    else for (const c of entry.capabilities) if (!CAPABILITIES.includes(c)) problems.push('unknown capability: ' + c)
  }
  if (entry.kind && entry.kind !== 'rules' && typeof entry.handler !== 'function' && typeof entry.file !== 'string') {
    problems.push('a non-rules entry needs a handler function or a file')
  }
  return problems
}

function scopeMatches(scope, ctx) {
  if (!scope) return true
  const hit = (dim, value) => {
    const want = scope[dim]
    if (want === undefined || want === '*') return true
    const list = Array.isArray(want) ? want : [want]
    return list.includes(value)
  }
  return hit('member', ctx.member) && hit('role', ctx.role) && hit('phase', ctx.phase)
}

/**
 * Create the bus. `entries` are middleware declarations; `handlers` may be attached later with `on()`
 * (that is how code modules register). `settings` is the resolved settings map from settings/schema.js.
 */
export function createBus({ entries = [], settings = {}, clock = () => new Date().toISOString(), onAudit } = {}) {
  const hookTimeoutMs = Number.isInteger(settings['vmu.middleware.hookTimeoutMs']) ? settings['vmu.middleware.hookTimeoutMs'] : 2000
  const breakerThreshold = Number.isInteger(settings['vmu.middleware.breakerThreshold']) ? settings['vmu.middleware.breakerThreshold'] : 3

  const registry = new Map() // id -> entry (normalised)
  const failures = new Map() // id -> consecutive failure count
  const disabled = new Map() // id -> reason
  const hits = new Map() // id -> times it returned a decision
  const traces = new Map() // traceId -> [{ts, hook, entry, outcome, detail}]
  const traceOrder = []
  let dryRun = false
  let seq = 0
  // Topics a deployment declared EXPLICITLY (docs/05 §6 protocol extension). The frozen VU_HOOKS set is the
  // contract; anything else must be declared before it can be emitted - zero mechanism, nothing implicit.
  const customTopics = new Set()

  const audit = (record) => {
    const row = Object.assign({ ts: clock(), seq: seq++ }, record)
    if (typeof onAudit === 'function') onAudit(row)
    return row
  }

  const remember = (traceId, row) => {
    if (!traceId) return
    const list = traces.get(traceId) || []
    list.push(row)
    traces.set(traceId, list)
    traceOrder.push(traceId)
    while (traceOrder.length > 64) traces.delete(traceOrder.shift())
  }

  const add = (entry) => {
    const problems = validateEntry(entry)
    if (problems.length > 0) {
      throw refuse('VMU_MIDDLEWARE_FAILED', 'invalid middleware entry: ' + problems.join('; '),
        'see docs/05 §2 and §9 for the accepted shape')
    }
    if (registry.has(entry.id)) {
      throw refuse('VMU_MIDDLEWARE_FAILED', 'duplicate middleware id (conflicts are never resolved silently): ' + entry.id,
        'pack overrides must be declared explicitly (docs/10 §4)')
    }
    const on = Array.isArray(entry.on) ? entry.on : [entry.on]
    const normalised = Object.assign({}, entry, {
      on,
      enabled: entry.enabled !== false,
      order: Number.isInteger(entry.order) ? entry.order : 1000,
      failure: entry.failure || DEFAULT_FAILURE[on[0]] || 'closed',
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.slice() : [],
      source: entry.source || 'session',
    })
    registry.set(normalised.id, normalised)
    audit({ what: 'middleware/registered', id: normalised.id, on: normalised.on.join(','), order: normalised.order, failure: normalised.failure })
    return normalised
  }

  const sortedFor = (hook) => [...registry.values()]
    .filter((e) => e.enabled && e.on.includes(hook) && !disabled.has(e.id))
    .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const withTimeout = async (fn, payload) => {
    if (!(hookTimeoutMs > 0)) return fn(payload)
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(refuse('VMU_MIDDLEWARE_FAILED', 'hook exceeded its budget of ' + hookTimeoutMs + 'ms')), hookTimeoutMs)
    })
    try { return await Promise.race([fn(payload), timeout]) } finally { clearTimeout(timer) }
  }

  const checkCapability = (entry, decision) => {
    const used = Object.keys(decision).filter((k) => DECISION_CAPABILITY[k] !== undefined)
    for (const key of used) {
      const cap = DECISION_CAPABILITY[key]
      if (!entry.capabilities.includes(cap)) {
        throw refuse('VMU_MIDDLEWARE_FAILED',
          'middleware ' + entry.id + ' used capability "' + cap + '" without declaring it',
          'declare capabilities in the entry (docs/05 §6)')
      }
    }
    return decision
  }

  const recordFailure = (entry, error) => {
    const n = (failures.get(entry.id) || 0) + 1
    failures.set(entry.id, n)
    audit({ what: 'middleware/failed', id: entry.id, consecutive: n, code: error && error.code, error: String(error && error.message) })
    if (n >= breakerThreshold) {
      disabled.set(entry.id, 'breaker: ' + n + ' consecutive failures')
      audit({ what: 'middleware/breaker-tripped', id: entry.id, threshold: breakerThreshold })
    }
  }

  const bus = {
    /** Register a code-module handler for an entry (also used by tests to inject handlers). */
    on(entry, handler) {
      const normalised = add(Object.assign({}, entry, { handler }))
      return normalised.id
    },
    add,
    entries: () => [...registry.values()].map((e) => Object.assign({}, e, { handler: undefined, disabled: disabled.get(e.id) || null })),

    setDryRun(value) { dryRun = !!value; audit({ what: 'middleware/dry-run', value: dryRun }) },
    isDryRun: () => dryRun,

    disable(id, reason) {
      if (!registry.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown middleware id: ' + id)
      disabled.set(id, reason || 'disabled by operator')
      audit({ what: 'middleware/disabled', id, reason: disabled.get(id) })
      return { ok: true, id, disabled: true }
    },
    enable(id) {
      if (!registry.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown middleware id: ' + id)
      disabled.delete(id)
      failures.delete(id)
      audit({ what: 'middleware/enabled', id })
      return { ok: true, id, disabled: false }
    },

    /**
     * Declare a NEW hook topic (docs/05 §6, the protocol-extension point). The frozen `VU_HOOKS` set is the
     * contract, so a genuinely new topic must be declared here before anything may emit it: nothing appears
     * without a declaration (zero mechanism). Declaring twice is not an error, and `existing` says which.
     */
    declareTopic(name) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(name)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a hook topic must look like domain/name: ' + String(name),
          'e.g. lab/review-requested (kebab-case on both sides)')
      }
      const existing = VU_HOOKS.includes(name) || customTopics.has(name)
      customTopics.add(name)
      return { ok: true, topic: name, existing }
    },

    /**
     * Run one hook. Returns { ok, decisions, traceId, refused? , aborted? }.
     * A deny is terminal and named; an abort is reported to the caller to end the turn or stage.
     */
    async emit(hook, payload = {}, opts = {}) {
      // HOOK-NAME MEMBERSHIP (independent verification, task-40). The name was never validated, so a misspelled
      // hook - or a name that had drifted from the frozen set (the proven case: `prompt/assemble` was emitted
      // while the registry declared `prompt/section-assembled`) - reached NO listener: the middleware never ran
      // and nothing said so. An unknown name is now refused BY NAME, and the message names the extension point.
      // The host-waterfall BRIDGE is exempt (`opts.bridge`): it deliberately forwards the host's own hook names,
      // which are DSH's vocabulary, not vmu's, and refusing them would break the substrate bridge itself.
      const bridged = opts && opts.bridge === true
      if (!bridged && (typeof hook !== 'string' ||
        !(VU_HOOKS.includes(hook) || BRIDGE_TOPICS.includes(hook) || customTopics.has(hook)))) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'unknown vmu hook: ' + String(hook) + ' (' + VU_HOOKS.length + ' declared + ' + customTopics.size + ' custom)',
          'declared: ' + VU_HOOKS.join(', ') + ' — declare a NEW topic with bus.declareTopic(name)')
      }
      const traceId = opts.traceId || ('t' + (++seq) + '-' + hook.replace(/[^a-z]+/gi, '-'))
      const ctx = { member: opts.member, role: opts.role, phase: opts.phase }
      const decisions = []
      for (const entry of sortedFor(hook)) {
        if (!scopeMatches(entry.scope, ctx)) continue
        if (typeof entry.handler !== 'function') {
          audit({ what: 'middleware/skipped', id: entry.id, hook, why: 'no handler attached' })
          continue
        }
        let decision
        try {
          decision = await withTimeout(entry.handler, { hook, payload, ctx, dryRun, traceId, setting: (k) => settings[k] })
        } catch (error) {
          recordFailure(entry, error)
          const policy = entry.failure
          const row = { what: 'middleware/failure-policy', id: entry.id, hook, policy, traceId, error: String(error && error.message) }
          audit(row)
          remember(traceId, Object.assign({ hook, entry: entry.id, outcome: 'failed' }, row))
          if (policy === 'open') continue
          if (policy === 'abort') {
            return { ok: false, aborted: true, code: error && error.code ? error.code : 'VMU_MIDDLEWARE_FAILED',
              message: 'middleware ' + entry.id + ' failed in abort mode: ' + String(error && error.message), entry: entry.id, traceId }
          }
          return { ok: false, code: 'VMU_MIDDLEWARE_FAILED',
            message: 'middleware ' + entry.id + ' failed in closed mode: ' + String(error && error.message), entry: entry.id, traceId }
        }
        if (decision === undefined || decision === null) {
          failures.set(entry.id, 0)
          continue
        }
        // A capability violation is a configuration DEFECT, not a policy matter: it is always treated
        // as closed (refuse the operation), audited, and counted towards the breaker.
        try {
          checkCapability(entry, decision)
        } catch (error) {
          recordFailure(entry, error)
          remember(traceId, { hook, entry: entry.id, outcome: 'capability-violation' })
          return { ok: false, code: 'VMU_MIDDLEWARE_FAILED',
            message: String(error && error.message), entry: entry.id, traceId }
        }
        failures.set(entry.id, 0)
        hits.set(entry.id, (hits.get(entry.id) || 0) + 1)
        const applied = dryRun ? Object.assign({}, decision, { dryRun: true }) : decision
        decisions.push({ id: entry.id, decision: applied })
        audit({ what: 'middleware/decision', id: entry.id, hook, keys: Object.keys(decision).join(','), dryRun, traceId })
        remember(traceId, { hook, entry: entry.id, outcome: 'decided', keys: Object.keys(decision) })
        if (decision.deny || decision.cancel) {
          const d = decision.deny || decision.cancel
          return { ok: false, decision: applied, refused: {
            code: (d && d.code) || (decision.cancel ? 'VMU_MIDDLEWARE_REJECTED' : 'VMU_INVALID_ARGUMENT'),
            message: (d && d.message) || (d && d.reason) || 'refused by middleware ' + entry.id,
            hint: d && d.hint,
          }, entry: entry.id, decisions, traceId }
        }
      }
      // The FULL decision is returned, not only its terminal kinds: an adapter (the DSH hook bridge) must be
      // able to see `ask`, `rewriteArgs`, `replaceResult`, `record` and friends. A bus that surfaced only
      // denials left those actions silently unusable - a gap the host-hook scenario exposed.
      const last = decisions.length > 0 ? decisions[decisions.length - 1].decision : null
      return { ok: true, decisions, traceId, decision: last }
    },

    /** Observability (R11): ordered entries with their enable state, hits, failures and breaker state. */
    status() {
      return {
        dryRun,
        hookTimeoutMs,
        breakerThreshold,
        entries: [...registry.values()]
          .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1))
          .map((e) => ({ id: e.id, kind: e.kind, order: e.order, on: e.on, failure: e.failure,
            capabilities: e.capabilities, scope: e.scope || null, source: e.source,
            enabled: e.enabled && !disabled.has(e.id), disabledReason: disabled.get(e.id) || null,
            hits: hits.get(e.id) || 0, consecutiveFailures: failures.get(e.id) || 0 })),
        hooks: [...new Set([...registry.values()].flatMap((e) => e.on))].sort(),
      }
    },

    trace(traceId) { return (traces.get(traceId) || []).map((r) => Object.assign({}, r)) },

    /**
     * The host-waterfall contract (docs/05 §1, docs/04 §3.1 of the recon): a listener that returns
     * undefined MUST let the chain continue. Middleware never touches the host waterfall directly —
     * this wrapper is the only place that knows about `next`.
     */
    wrapHostWaterfall(next) {
      if (typeof next !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'wrapHostWaterfall needs the host next()')
      return async (payload) => {
        const result = await bus.emit(payload && payload.hook ? payload.hook : 'host/waterfall', payload)
        if (result && result.ok === false) return result
        return next(payload)
      }
    },
  }

  for (const e of entries) add(e)
  return bus
}
