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

/** The capability vocabulary. A decision may only use what its entry declared (docs/05 §3.2, §6). */
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
  'member/self-report',
  'budget/warn',
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
  // ROUND 496: budget/warn was EMITTED (kernel/budget.js) inside VMU's own namespace while not being frozen, so the
  // membership check REFUSED it - a live bug on the ordinary budget-warning path. A warning is OBSERVATION, so its policy
  // is open, exactly like control/*: a broken listener must not turn a warning into a failure.
  'budget/warn': 'open',
  // ROUND 496: found by the same scan as budget/warn - members.js emitted this inside VMU's namespace while it was NOT
  // frozen, so the bus refused it. A self-report is observation, hence open.
  'member/self-report': 'open',
  'pack/loading': 'closed', 'pack/loaded': 'closed',
  'settle/before': 'closed', 'settle/after': 'closed',
  // Control flow is OBSERVATION for middleware (a watcher may react), so the framework keeps running when a
  // listener fails: an open policy here is what stops a broken watcher from freezing the whole run.
  'control/paused': 'open', 'control/resumed': 'open', 'control/heartbeat': 'open',
})

/**
 * THE HOOK REGISTRY — ONE RECORD PER HOOK (decision D-04).
 *
 * The project carried three tables that drifted apart: `VU_HOOKS` (the vmu names the bus enforces),
 * `DSH_HOOKS` (what a module may subscribe to, kernel/loader.js) and `BRIDGED_HOOKS` (what the host
 * bridge can really attach, host-hooks.js). The registry below is the single record of:
 *   name · kind (vmu|host) · failure semantics · whether it can block · whether it can rewrite ·
 *   its scope dimensions · when it fires · its real producer · whether the host bridge attaches it
 *     (and at which site).
 * `DSH_HOOKS` and `BRIDGED_HOOKS` are DERIVED from it (loader.js and host-hooks.js re-export the
 * derived arrays), and `hookRegistryProblems()` asserts that the frozen `VU_HOOKS` / `DEFAULT_FAILURE`
 * literals still agree with it. Those two stay literals because three shipped gates parse their exact
 * source text (tests/audit-hook-coverage.test.mjs:31, tests/audit-doc-vs-code-tables.test.mjs:59,
 * scripts/generate-surface-index.mjs:39-41); the assertion is what keeps them from drifting.
 */
const VU_SCOPE = Object.freeze(['member', 'role', 'phase'])
const BRIDGE_SITE = 'host-hooks.js attachHostHooks (ctx.effect -> ctx.on)'
export const HOOK_REGISTRY = Object.freeze([
  // ── vmu-internal hooks (docs/05 §4.2 / §5) ────────────────────────────────────────────────────────
  { name: 'member/self-report', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a member reports on itself', producer: 'kernel/members.js' },
  { name: 'budget/warn', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a budget crosses its warning line', producer: 'kernel/budget.js' },
  { name: 'member/wake-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before a member is woken', producer: 'kernel/members.js' },
  { name: 'member/wake-after', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after a member was woken', producer: 'kernel/members.js' },
  { name: 'turn/reply-parsed', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a turn reply was parsed, before dispatch', producer: 'kernel/turn/index.js' },
  { name: 'meeting/round-start', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a meeting round opens', producer: 'kernel/meeting.js' },
  { name: 'meeting/round-end', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a meeting round closes', producer: 'kernel/meeting.js, kernel/minutes.js' },
  { name: 'ballot/cast', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a vote is cast', producer: 'kernel/ballot.js' },
  { name: 'ballot/tally', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a ballot is tallied', producer: 'kernel/ballot.js, packs/v3-core' },
  { name: 'record/append-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before any record is validated or written', producer: 'kernel/library.js' },
  { name: 'record/appended', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a record was appended', producer: 'kernel/compliance.js, kernel/handover.js, kernel/minutes.js, kernel/tenure.js' },
  { name: 'task/assign', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a task is assigned', producer: 'kernel/members.js, kernel/tasks.js' },
  { name: 'task/transition', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a task changes state', producer: 'kernel/tasks.js' },
  { name: 'prompt/section-assembled', kind: 'vmu', failure: 'open', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a prompt assembly asks for section decisions', producer: 'kernel/prompt/index.js' },
  { name: 'budget/exceeded', kind: 'vmu', failure: 'abort', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a conserving allocation fails', producer: 'kernel/fairness.js' },
  { name: 'pack/loading', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before a pack changes anything (may refuse)', producer: 'kernel/pack.js' },
  { name: 'pack/loaded', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after every manifest is in place', producer: 'kernel/pack.js' },
  { name: 'settle/before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'before a settlement', producer: 'kernel/tasks.js' },
  { name: 'settle/after', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after a settlement', producer: 'kernel/tasks.js' },
  { name: 'control/paused', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the kernel is paused', producer: 'kernel/index.js' },
  { name: 'control/resumed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the kernel is resumed', producer: 'kernel/index.js' },
  { name: 'control/heartbeat', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a control heartbeat', producer: 'kernel/index.js' },

  // ── host-substrate hooks (docs/05 §4.1): the vocabulary belongs to DSH, not to vmu ─────────────────
  { name: 'tools/pre-execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'before a tool call runs (input rewriting is refused by the host)' },
  { name: 'tools/post-execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: true, timing: 'after a tool call ran' },
  { name: 'tools/execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'tool execution (observation)' },
  { name: 'tools/result', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a tool result exists (observation)' },
  { name: 'prompt/assemble', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the HOST assembles its system prompt' },
  { name: 'prompt/section', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'host prompt-section registration (subscribe-only)' },
  { name: 'agent/pre-step', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'before an agent step' },
  { name: 'agent/request', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'an agent request is issued (subscribe-only)' },
  { name: 'agent/request-error', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'an agent request failed (subscribe-only)' },
  { name: 'agent/turn-stopping', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the host turn ends (the per-turn tool budget resets here)' },
  { name: 'agent/inbox', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'agent inbox delivery (subscribe-only)' },
  { name: 'agent/created', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'an agent was created' },
  { name: 'subagent/start', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a subagent starts' },
  { name: 'subagent/end', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a subagent ends' },
  { name: 'session/event', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a session event' },
  { name: 'session/flush', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'a session is flushed (subscribe-only)' },
  { name: 'fs/write-intent', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'a write is about to happen' },
  { name: 'settings/changed', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'settings changed' },
  { name: 'system-prompt/assemble', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the host assembles its system prompt (host-side name)' },
])

/** The host-substrate names a module may subscribe to — DERIVED from the registry. */
export const DSH_HOOKS = Object.freeze(HOOK_REGISTRY.filter((h) => h.kind === 'host').map((h) => h.name))

/** The host hooks the bridge can really attach — DERIVED from the registry (`bridged: true`). */
export const BRIDGED_HOOKS = Object.freeze(HOOK_REGISTRY.filter((h) => h.kind === 'host' && h.bridged === true).map((h) => h.name))

/** Hook namespaces a module may subscribe to by PREFIX (a workflow topic is named by its own pack). */
export const HOOK_PREFIXES = Object.freeze(['workflow/'])

/**
 * The D-04 assertion: one registry, and every derived table agrees with it. Returns a list of problems
 * (empty means consistent). A gate can call this without re-implementing the rules; it checks:
 *   · no duplicate names, every entry has a kind and a name;
 *   · `VU_HOOKS` and the registry's vmu names are the same set, both directions;
 *   · `DEFAULT_FAILURE` states exactly the registry's failure for every vmu hook;
 *   · `DSH_HOOKS`/`BRIDGED_HOOKS` are the registry's host names and its `bridged:true` subset;
 *   · every bridged hook NAMES its registration site (so "bridged" cannot be a claim with no code).
 */
export function hookRegistryProblems() {
  const problems = []
  const seen = new Set()
  for (const h of HOOK_REGISTRY) {
    if (!h || typeof h.name !== 'string' || h.name.length === 0) { problems.push('a registry entry has no name'); continue }
    if (seen.has(h.name)) problems.push('duplicate hook in the registry: ' + h.name)
    seen.add(h.name)
    if (h.kind !== 'vmu' && h.kind !== 'host') problems.push(h.name + ': kind must be vmu|host')
    if (h.kind === 'host' && h.bridged === true && (typeof h.bridgeSite !== 'string' || h.bridgeSite.length === 0)) {
      problems.push(h.name + ': a bridged hook must name its registration site (bridgeSite)')
    }
    if (h.kind === 'vmu' && typeof h.failure !== 'string') problems.push(h.name + ': a vmu hook must state its failure policy')
  }
  const regVmu = HOOK_REGISTRY.filter((h) => h.kind === 'vmu').map((h) => h.name)
  for (const n of VU_HOOKS) if (!regVmu.includes(n)) problems.push('VU_HOOKS names ' + n + ' but the registry does not')
  for (const n of regVmu) if (!VU_HOOKS.includes(n)) problems.push('the registry names ' + n + ' but VU_HOOKS does not')
  for (const h of HOOK_REGISTRY.filter((x) => x.kind === 'vmu')) {
    if (DEFAULT_FAILURE[h.name] !== h.failure) problems.push(h.name + ': DEFAULT_FAILURE says ' + String(DEFAULT_FAILURE[h.name]) + ', the registry says ' + h.failure)
  }
  const regHost = HOOK_REGISTRY.filter((h) => h.kind === 'host').map((h) => h.name)
  for (const n of DSH_HOOKS) if (!regHost.includes(n)) problems.push('DSH_HOOKS names ' + n + ' but the registry does not')
  for (const n of BRIDGED_HOOKS) if (!DSH_HOOKS.includes(n)) problems.push('a bridged hook is not subscribable: ' + n)
  return problems
}

/**
 * THE KINDS THE BUS CAN ACTUALLY RUN (decision D-03: no paper forms).
 *
 * `script` and `plugin` used to be ACCEPTED here and then silently skipped at emit time (`emit()` logs
 * `middleware/skipped` for an entry without a handler), so such a declaration validated clean and never
 * fired. They are now REFUSED BY NAME (`VMU_MIDDLEWARE_KIND_UNSUPPORTED`) with the REAL carrier in the
 * hint, because the bus owns no file loader and no plugin host:
 *   · M3 script/workflow -> kernel/script-bridge.js + the `vibe_vmu_script` tool (config.scripts);
 *   · M4 external plugin -> a DSH plugin consuming vmu's published services (an integration pack is L4,
 *     kernel/pack.js, its own tier — not a bus entry).
 */
export const SUPPORTED_KINDS = Object.freeze(['rules', 'module'])

/** kind -> why it is not a bus entry, and where it really lives (the hint a refusal carries). */
export const UNSUPPORTED_KIND_CARRIERS = Object.freeze({
  script: 'M3 scripts/workflows run through kernel/script-bridge.js and the `vibe_vmu_script` tool (declare them with config.scripts), not as a bus entry',
  plugin: 'M4 external plugins are DSH plugins consuming vmu\'s published services; an integration pack is L4 (kernel/pack.js), its own tier, not a bus entry',
})

/** The unsupported kind of an entry, or null when the bus can run it. */
export function unsupportedKind(entry) {
  const k = entry && entry.kind
  if (k === undefined || k === null || SUPPORTED_KINDS.includes(k)) return null
  return String(k)
}

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
  const badKind = unsupportedKind(entry)
  if (badKind && UNSUPPORTED_KIND_CARRIERS[badKind]) {
    problems.push('kind "' + badKind + '" is not a bus entry kind: ' + UNSUPPORTED_KIND_CARRIERS[badKind])
  } else if (badKind) {
    problems.push('kind must be rules|module (got ' + JSON.stringify(entry.kind) + ')')
  }
  const on = Array.isArray(entry.on) ? entry.on : [entry.on]
  if (on.length === 0 || on.some((h) => typeof h !== 'string' || h.length === 0)) problems.push('on must name at least one hook')
  if (entry.failure !== undefined && !Object.values(FAILURE).includes(entry.failure)) problems.push('failure must be open|closed|abort')
  if (entry.order !== undefined && !Number.isInteger(entry.order)) problems.push('order must be an integer')
  if (entry.capabilities !== undefined) {
    if (!Array.isArray(entry.capabilities)) problems.push('capabilities must be a list')
    else for (const c of entry.capabilities) if (!CAPABILITIES.includes(c)) problems.push('unknown capability: ' + c)
  }
  // A `file` is NOT a handler: the bus never loads files, so a file-only entry used to register clean and
  // then be skipped at emit time. A module file is loaded by kernel/loader.js toBusEntries(), which hands the
  // bus an entry WITH a handler; anything else must arrive here with one too.
  if (entry.kind && entry.kind !== 'rules' && typeof entry.handler !== 'function') {
    problems.push('a non-rules bus entry needs a handler function (the bus does not load files: load a module file with kernel/loader.js, which attaches the handler before add())')
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
  // ROUND 294 (volume 05 §L77/§L81/§L63): the DECLARED defaults for three per-entry fields. Each replaces a value that was hard-coded
  // here, so declaring one changes what an entry that does not state its own gets - and nothing else.
  const enabledDefault = settings['vmu.middleware.enabled'] !== false
  const orderDefault = Number.isInteger(settings['vmu.middleware.order']) ? settings['vmu.middleware.order'] : 1000
  const failureDefault = ['closed', 'open', 'skip'].includes(settings['vmu.middleware.onFailure']) ? settings['vmu.middleware.onFailure'] : null

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
    // D-03: a kind the bus cannot run is refused BY NAME, before anything else, with its real carrier in
    // the hint. Accepting it here and skipping it at emit time was the paper form this closes.
    const badKind = unsupportedKind(entry)
    if (badKind && UNSUPPORTED_KIND_CARRIERS[badKind]) {
      throw refuse('VMU_MIDDLEWARE_KIND_UNSUPPORTED',
        'the bus cannot run a middleware entry of kind "' + badKind + '": ' + UNSUPPORTED_KIND_CARRIERS[badKind],
        'declare it where its carrier lives (docs/05 §2: M1 rules and M2 modules are bus entries; M3 scripts and M4 external plugins are not)')
    }
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
      enabled: entry.enabled === undefined ? enabledDefault : entry.enabled !== false,
      order: Number.isInteger(entry.order) ? entry.order : orderDefault,
      failure: entry.failure || failureDefault || DEFAULT_FAILURE[on[0]] || 'closed',
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
      // E3 (task-154): the hook NAME is validated FIRST. Before this, `emit(123)` died inside
      // `hook.replace(...)` with a bare TypeError, `emit({})` likewise, `emit(null)` with "Cannot read
      // properties of null", and `emit('')` was ACCEPTED (an unnamed hook can reach no listener, so every
      // subscriber silently never ran). A nameless emission is now a NAMED refusal — never a crash, never a
      // silent no-op; valid string hooks (including declared custom topics) are untouched.
      if (typeof hook !== 'string' || hook.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'bus.emit needs a NON-EMPTY STRING hook, got ' + (hook === null ? 'null' : Array.isArray(hook) ? 'array' : typeof hook) + (typeof hook === 'string' ? ' (empty/whitespace)' : ''),
          'e.g. bus.emit("control/paused", payload) — declare a new topic with bus.declareTopic(name); an unnamed hook reaches nobody')
      }
      // HOOK-NAME MEMBERSHIP (independent verification, task-40). The name was never validated, so a misspelled
      // hook - or a name that had drifted from the frozen set (the proven case: `prompt/assemble` was emitted
      // while the registry declared `prompt/section-assembled`) - reached NO listener: the middleware never ran
      // and nothing said so. The rule is now NAMESPACE-AWARE:
      //   · a name in VMU's OWN namespaces must be in VU_HOOKS (or declared with `declareTopic`);
      //   · a name in a FOREIGN namespace (the host's vocabulary, e.g. `tools/pre-execute`, `fs/write-intent`)
      //     is passed through, because that vocabulary belongs to the substrate - and note that `prompt/assemble`
      //     is a HOST name, so allowing all host names wholesale would have re-admitted exactly the drift this
      //     check exists to catch. The host-waterfall bridge (`opts.bridge`) is exempt for the same reason.
      const VU_NAMESPACE = /^(member|turn|meeting|ballot|record|task|prompt|budget|pack|settle|control)\//
      const bridged = opts && opts.bridge === true
      const isVmuName = typeof hook === 'string' && VU_NAMESPACE.test(hook)
      if (!bridged && isVmuName && !(VU_HOOKS.includes(hook) || customTopics.has(hook))) {
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
     * The host-waterfall contract (docs/05 §1, docs/03 for the contract itself): a listener that returns
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
