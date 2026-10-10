// vmu host hooks — the bridge that makes the vmu bus fire on REAL host events (docs/05 §4, docs/11 §9).
//
// Until now the four middleware forms ran on the vmu bus, but the real host never called that bus: a
// declared M1 rule existed and never triggered. This file is the missing link, and it is written from the
// host's own signatures (recon §3.1, §17), not from memory:
//
//   ctx.on('tools/pre-execute', async (exec, next) => PreToolDecision)   // waterfall
//   ctx.on('tools/post-execute', async (exec, result, next) => PostToolDecision)
//
// Decision mapping (vmu -> host), refusing to invent anything the host does not support:
//   deny    -> { kind: 'deny', reason }        (the reason becomes the model-visible refusal)
//   cancel  -> { kind: 'cancel' }
//   ask     -> { kind: 'ask', reason }
//   allow / nothing -> await next()            (an abstaining wrapper MUST delegate)
//   record / notify / annotate / setSetting -> side effects only, then await next()
//   rewriteArgs on pre-execute -> REFUSED and NAMED: the host's pre-execute explicitly excludes input
//   rewriting (the arguments are already recorded and presented), so a middleware that asks for it gets a
//   named refusal instead of a silent no-op.
//
// Zero mechanism holds here too: with no declared middleware entry on a host hook, NO listener is
// registered at all.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The host hooks this bridge knows how to map (docs/05 §4.1). */
export const BRIDGED_HOOKS = Object.freeze([
  'tools/pre-execute', 'tools/post-execute', 'tools/execute', 'tools/result',
  'agent/pre-step', 'agent/turn-stopping', 'agent/created',
  'subagent/start', 'subagent/end',
  'session/event', 'system-prompt/assemble', 'prompt/assemble', 'settings/changed', 'fs/write-intent',
])

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

const textPart = (text) => [{ type: 'text', text: String(text) }]

/**
 * Map a vmu bus decision to the host's pre-execute decision (or null to abstain). The denial REASON names
 * the middleware that decided, because the host's refusal is the only thing the model and the audit see.
 */
export function toPreExecuteDecision(decision, { hook = 'tools/pre-execute' } = {}) {
  if (!decision || typeof decision !== 'object') return null
  if (decision.rewriteArgs) {
    return { kind: 'refuse-unsupported', code: 'VMU_NOT_PERMITTED',
      message: 'the host\'s ' + hook + ' excludes input rewriting (the arguments are already recorded and presented)',
      hint: 'use a code module that returns a decision the host supports, or change the call before dispatch' }
  }
  if (decision.deny) {
    const by = decision.deny.by ? ' [middleware ' + decision.deny.by + ']' : ''
    return { kind: 'deny', reason: [decision.deny.code, decision.deny.message].filter(Boolean).join(': ') + by }
  }
  if (decision.cancel) {
    const by = decision.cancel.by ? ' [middleware ' + decision.cancel.by + ']' : ''
    return { kind: 'cancel', reason: [decision.cancel.code, decision.cancel.message, decision.cancel.reason].filter(Boolean).join(': ') + by }
  }
  if (decision.ask) return { kind: 'ask', reason: (decision.ask.reason || 'vmu middleware requires approval') + (decision.ask.by ? ' [middleware ' + decision.ask.by + ']' : '') }
  return null
}

/** Map a vmu bus decision to the host's post-execute decision (or null to abstain). */
export function toPostExecuteDecision(decision) {
  if (!decision || typeof decision !== 'object') return null
  if (decision.replaceResult) return { kind: 'accept', value: decision.replaceResult.value }
  const block = decision.deny || decision.block
  if (block) return { kind: 'block', feedback: textPart([block.code, block.message].filter(Boolean).join(': ')) }
  return null
}

/**
 * Attach the vmu bus to the host's hooks, but ONLY for the hooks the configuration declares.
 *
 * `entries` is the declared middleware list; `kernel.bus` is the vmu bus. Every registration goes through
 * `ctx.effect(..., 'vmu:hook:<name>')`, so the host unwinds it.
 */
export function attachHostHooks({ ctx, kernel, settings = {}, log = () => {} } = {}) {
  const attached = []
  const refused = []
  // The per-turn tool budget (vmu.limits.toolCallsPerTurnCap): counted here because the HOST is what sees
  // tool calls, and reset on the host's turn-end event. Refusals are counted for observability.
  let turnCalls = 0
  let budgetRefusals = 0

  const declaredHooks = () => {
    const entries = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
    const hooks = new Set()
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue
      for (const h of [].concat(e.on || [])) if (BRIDGED_HOOKS.includes(h)) hooks.add(h)
    }
    // REALITY, not only the declaration: packs and M2 modules add bus entries AFTER load, and a hook that
    // exists on the bus but is not bridged is a middleware entry that silently never fires.
    const busEntries = kernel.bus && kernel.bus.status ? (kernel.bus.status().entries || []) : []
    for (const e of busEntries) {
      if (!e || e.enabled === false) continue
      for (const h of [].concat(e.on || [])) if (BRIDGED_HOOKS.includes(h)) hooks.add(h)
    }
    // A FRAMEWORK limit is not middleware: with `vmu.limits.toolCallsPerTurnCap` set, the bridge must attach
    // the pre-execute hook (and the turn-end hook that resets the count) even when NO middleware is declared -
    // otherwise the promised cap would silently only work for configurations that happen to have middleware.
    if (Number(settings['vmu.limits.toolCallsPerTurnCap']) > 0) {
      hooks.add('tools/pre-execute')
      hooks.add('agent/turn-stopping')
    }
    return [...hooks]
  }

  const bridge = {
    /** What WOULD be attached (pure) - the host-side zero-mechanism proof for hooks. */
    plan() { return { hooks: declaredHooks(), count: declaredHooks().length } },

    attach() {
      const planned = declaredHooks()
      // Only demand an event surface when there is actually something to attach: a configuration whose
      // entries target non-host hooks must not fail for lacking ctx.on.
      if (planned.length > 0 && (!ctx || typeof ctx.on !== 'function')) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host context has no ctx.on: hooks cannot be bridged',
          'pass a DSH context; the bridge never invents an event surface')
      }
      for (const hook of planned) {
        if (attached.some((a) => a.hook === hook)) continue
        const listener = async (...args) => {
          const next = args[args.length - 1]
          const delegating = typeof next === 'function'
          const exec = args[0] || {}
          // A TURN-END resets the per-turn tool budget; the budget itself is read AT CALL TIME, so an H0
          // change takes effect on the very next call (docs/04 §5). Without this, the promised
          // `vmu.limits.toolCallsPerTurnCap` was a knob with no enforcement anywhere.
          if (hook === 'agent/turn-stopping') { turnCalls = 0 }
          if (hook === 'tools/pre-execute') {
            const cap = Number(settings['vmu.limits.toolCallsPerTurnCap']) || 0
            turnCalls += 1
            if (cap > 0 && turnCalls > cap) {
              budgetRefusals += 1
              const reason = 'VMU_RESOURCE_BUDGET: this turn already used ' + (turnCalls - 1) + ' of ' + cap +
                ' tool calls [framework vmu.limits.toolCallsPerTurnCap]'
              log('vmu refused a tool call: ' + reason)
              return { kind: 'deny', reason }
            }
          }
          const payload = { tool: exec.name || exec.tool || null, args: exec.args || {}, agent: exec.agent || null, hook }
          let decided = null
          try {
            // BRIDGE: these are the HOST's hook names (DSH vocabulary), forwarded so vmu middleware can observe
            // and steer them. The bus refuses names outside its frozen set - except on the bridge path, which is
            // exempt precisely because the vocabulary here belongs to the substrate, not to vmu (kernel/bus.js).
            decided = await kernel.bus.emit(hook, payload, { bridge: true })
          } catch (e) {
            // A middleware failure must not silently allow the call: the host's own failure policy applies,
            // and vmu records the reason (docs/05 §7).
            log('vmu hook ' + hook + ' failed: ' + String(e && e.message))
          }
          // The bus returns the full decision (deny / cancel / ask / rewriteArgs / replaceResult / ...); a
          // denial also comes back as `refused`. Prefer the decision so `cancel` is not mistaken for a deny.
          const merged = (decided && decided.decision) || (decided && decided.ok === false && decided.refused ? { deny: decided.refused } : null)
          if (hook === 'tools/pre-execute') {
            const mapped = toPreExecuteDecision(merged, { hook })
            if (!mapped) return delegating ? await next() : undefined
            if (mapped.kind === 'refuse-unsupported') {
              refused.push({ hook, code: mapped.code, message: mapped.message })
              log('vmu refused an unsupported action on ' + hook + ': ' + mapped.message)
              return { kind: 'deny', reason: mapped.message }
            }
            return mapped
          }
          if (hook === 'tools/post-execute') {
            const mapped = toPostExecuteDecision(merged)
            if (!mapped) return delegating ? await next() : undefined
            return mapped
          }
          // Observation-only hooks: the decision is recorded, and the waterfall is always continued.
          return delegating ? await next() : undefined
        }
        const dispose = typeof ctx.effect === 'function'
          ? ctx.effect(() => ctx.on(hook, listener), 'vmu:hook:' + hook)
          : ctx.on(hook, listener)
        attached.push({ hook, dispose: typeof dispose === 'function' ? dispose : null })
        log('vmu bridged host hook ' + hook)
      }
      return { ok: true, attached: attached.map((a) => a.hook) }
    },

    /** Attach anything that appeared on the bus since the last call (packs, M2 modules). Idempotent. */
    refresh() { return bridge.attach() },

    detach() {
      const failures = []
      for (const a of attached.splice(0)) { try { if (a.dispose) a.dispose() } catch (e) { failures.push(String(e && e.message)) } }
      return { ok: failures.length === 0, failures }
    },

    status() {
      return { attached: attached.map((a) => a.hook), planned: declaredHooks(), refusedUnsupported: refused.slice(),
        turnCalls, budgetRefusals,
        note: 'with no declared entry on a host hook, no listener is registered; pre-execute refuses input rewriting instead of silently ignoring it; the per-turn tool budget is enforced here and resets on the host turn-end event' }
    },
  }

  return bridge
}
