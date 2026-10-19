import { SETTING_DEFS } from './settings/schema.js'
// vibe-math-vmu/host-deliver.js — THE TURN-DELIVERY ASSEMBLY, EXTRACTED FROM THE ENTRY.
//
// WHY IT LIVES HERE (Round 81): the entry had grown past the recorded 1200-line limit, and the size gate's contract
// is that its backlog may only SHRINK - so recording the overflow was correctly rejected and the overflow had to be
// removed instead. This block is the whole of one concern: which delivery route runs, and the seam that runs it.
//
// THE BOUNDARY IS UNCHANGED. The entry still owns assembly; this module owns the delivery assembly alone, and takes
// the context, config and settings it needs as parameters rather than reaching for them.
export function createTurnDeliver({ ctx, config = {}, settings = {}, deliverViaSubagents, deliverByReturning, getRootAgent = null }) {
    // ★★★ ROUND 74: WHICH DELIVERY ROUTE RUNS IS A DECLARATION, NOT A GUESS. Two routes ship: the HOST BRIDGE, which
    // asks the host to run the member turn as a subagent, and the CALLER-PLAYED turn, in which the assembled prompt
    // goes back to the session that called the tool and the member's reply comes in on the next call. The bridge is
    // preferred (it is what the original did); the caller route exists because the host types a subagent request's
    // `parent` as an Agent and marks it required while exposing only `list(): string[]`, so a plugin cannot construct a
    // legal parent. Measured: that boundary is why every subagent path failed on a real machine.
    //
    // `config.deliverMode` or the setting `vmu.turn.deliverMode` selects: 'subagents' (default) or 'caller'. Neither is
    // invented at run time - an unknown value is refused by name, because silently choosing for the deployment is the
    // failure this phase has ruled out everywhere else.
    // ★★★ ROUND 74 (corrected): THE CONFIG SHAPE IS NESTED. The framework plugin row's config is
    // `{ packs, root, vmu: { tools, deliverMode } }`, so a mode declared under `vmu` was invisible to a reader that
    // looked only at the top level - measured as no 'unknown delivery mode' refusal at all (the value was accepted)
    // together with delegationDepthOf still appearing (the subagents path still running). Both shapes are accepted,
    // with the nested one first because that is the shape this entry's own documented config uses.
    const declaredDeliverMode = (config.vmu && typeof config.vmu.deliverMode === 'string' && config.vmu.deliverMode)
      || (typeof config.deliverMode === 'string' && config.deliverMode)
      || (settings && typeof settings['vmu.turn.deliverMode'] === 'string' && settings['vmu.turn.deliverMode'])
      || 'subagents'
    if (declaredDeliverMode !== 'subagents' && declaredDeliverMode !== 'caller') {
      const err = new Error('unknown delivery mode: ' + String(declaredDeliverMode))
      err.code = 'VMU_INVALID_ARGUMENT'
      err.hint = 'vmu.turn.deliverMode (or config.deliverMode) is either "subagents" - the host runs the member turn - or "caller" - the calling session plays it and returns the reply through vibe_vmu_turn { reply }'
      throw err
    }
    const callerSeam = declaredDeliverMode === 'caller' ? deliverByReturning() : null

  // ★★★★★★★ ROUND 87 — IN CALLER MODE THIS FUNCTION MUST **BE** THE SEAM, NOT A WRAPPER AROUND IT.
  // MEASURED ON A REAL MACHINE: the refusals below reached it twenty-one times in a single run -
  // "this delivery seam does not accept a caller-supplied reply" - because the wrapper returned at the end of this
  // function is a plain arrow: `async ({ turn, text }) => callerSeam({ turn, text })`. That arrow has no `.supply`, so
  // `supplyMemberReply` refused EVERY reply the calling session handed back, and the caller-played route never once
  // delivered a member turn. The run looked like "replies are flowing" from the transcript alone, because the task
  // instructions quoted the phrase `supplied-by-caller` back into it; the seam's own fields were absent throughout
  // (`stopReason:"supplied-by-caller"`: 0 occurrences, `deliveryPath:"caller"`: 0). A wrapper that hides the capability
  // it wraps is the whole bug, so in caller mode the seam ITSELF is returned - carrying `supply`, `pending` and
  // `awaiting` with it - and the subagents bridge keeps its own wrapper below.
  if (callerSeam) return callerSeam
    const turnDeliver = async ({ turn, text } = {}) => {
      // ★ ROUND 80: DECLARED FIRST, BECAUSE THE REFUSAL BELOW READS THEM. T1 caught a temporal dead zone here: the
      // missing-seam hint reports parentKind and the agents keys, but both were declared further down, so that path
      // threw "Cannot access 'parentKind' before initialization" instead of the refusal it was written to produce.
      let parentKind = 'null'
      let agentKeys = null
      // (caller mode returned the seam above, so this wrapper only ever runs the HOST BRIDGE - the branch that used to
      // sit here was unreachable the moment the early return landed, and dead code that looks like a live route is how
      // a reader concludes a route works when it does not.)
      let subs = null
      try { subs = ctx && typeof ctx.get === 'function' ? ctx.get('subagents') : null } catch { subs = null }
      // ★★★ ROUND 63: THE ONE-SHOT PROVIDER, DISCOVERED RATHER THAN DEMANDED. `startContinuable` goes through the host's
      // continuable-activation registry, which REFUSES to admit a new activation while a previous one is still being torn
      // down - measured on a real machine as `startContinuable -> assertAdmitting -> closingTeardownFor -> liveLineage`,
      // and persistent rather than transient because the SLV driver already holds the root agent as an activation. The
      // host's own comment on that manager says "foreground one-shot delegation keeps calling `ctx.subagents.start()` and
      // NEVER ENTERS THIS LIFECYCLE". So delivery prefers the one-shot path when a provider can be named.
      //
      // THE NAME IS CONFIGURABLE AND, FALLING BACK, DISCOVERED. A deployment may set `config.deliverProvider` or the
      // declared setting - that stays the first choice. With neither, the host's OWN registry is asked which providers it
      // has (`listProviders()`), and the first is used. That is a default rather than an invention: the name comes from
      // the host that must accept it, and an empty registry simply leaves the continuable path in place, which is what a
      // host offering only that one needs.
      const declaredProvider = (typeof config.deliverProvider === 'string' && config.deliverProvider)
        || (settings && typeof settings['vmu.turn.deliverProvider'] === 'string' && settings['vmu.turn.deliverProvider'])
        || null
      let configuredProvider = declaredProvider
      // ★ PHASE 6: DSH 0.2.1-rc.2 replaced `start`/`startContinuable` with `startActivation`, so provider discovery
      // must accept that verb too - otherwise a 0.2.1 host is never asked which providers it has and the activation
      // path can never resolve a name.
      if (!configuredProvider && subs && (typeof subs.start === 'function' || typeof subs.startActivation === 'function') && typeof subs.list === 'function') {
        // ★★★ ROUND 64: THE METHOD IS `list()`. Round 63's discovery asked the host for `listProviders()` - which does
        // NOT EXIST (zero occurrences in the library) - so the condition was false, the discovery never ran, and the
        // one-shot path was never taken on a real machine. The library's own doc comment on the method reads "List
        // registered provider names in insertion order", and its body returns the map's keys. This is the same
        // contract-promising-what-the-implementation-does-not-do family this phase keeps removing, and this instance was
        // mine. `list()` is now used, and it is probed rather than assumed, so a host without it simply keeps the
        // continuable path.
        try {
          const names = subs.list()
          if (Array.isArray(names) && names.length > 0 && typeof names[0] === 'string') configuredProvider = names[0]
        } catch { configuredProvider = null }
      }
      // ★★★★★★★ PHASE 6: THE REFUSAL BELOW USED TO LIE. It said "the host exposes no subagents service" - which on
      // DSH 0.2.1-rc.2 is FALSE: the service is there (measured through the host's own catalog: startActivation,
      // waitForChildren, sendMessage, interrupt, listChildren, list, ...). What changed is the START verb: `start` and
      // `startContinuable` were removed and `startActivation` added. A refusal that names the wrong cause sends the next
      // reader looking for a missing service, so this one names WHICH verbs the host actually offers.
      // ★★★★★★★ PHASE 6: `!!subs &&` IS NOT DEFENSIVE PADDING - IT IS THE FIX. The first version of this line read
      // `typeof subs.startActivation === 'function'`, so when NO subagents service was bound (subs === undefined) the
      // refusal path itself died with "Cannot read properties of undefined (reading 'startActivation')" and the caller
      // received a bare TypeError instead of the named VMU_ENGINE_UNAVAILABLE it is entitled to. This is the SECOND
      // instance of "the hint/refusal itself throws" written in the same edit batch as the kernel one; the lesson is
      // that every new probe on a possibly-absent service needs the absence case written first, not last.
      const canActivate = !!subs && typeof subs.startActivation === 'function'
      if (!subs || (typeof subs.startContinuable !== 'function' && !canActivate && !(configuredProvider && typeof subs.start === 'function'))) {
        const offered = !subs ? '(no subagents service)' : Object.keys(Object.getPrototypeOf(subs) || {}).concat(Object.keys(subs)).filter((k) => /^start|^interrupt|^list|^send/.test(k)).slice(0, 10).join(',') || '(none of start*/list*/send*)'
        const err = new Error(!subs
          ? 'the host exposes no subagents service at all (ctx.get(\'subagents\') returned nothing), so no member turn can be delivered'
          : 'the host exposes a subagents service, but it offers none of start(), startActivation() or startContinuable() - so no member turn can be delivered')
        err.code = 'VMU_ENGINE_UNAVAILABLE'
        err.hint = 'verbs this host does offer: ' + offered + '. Inject { deliver } yourself, or run the caller-played route (vmu.turn.deliverMode="caller"), which never touches subagents. parentKind=' + parentKind + ' agentsKeys=' + JSON.stringify(agentKeys)
        throw err
      }
      const extract = typeof config.deliverReply === 'function' ? config.deliverReply : null
      // ★★★ ROUND 65: THE ONE-SHOT REQUEST NEEDS A PARENT AND A SIGNAL, AND BOTH ARE RESOLVED HERE RATHER THAN DEMANDED.
      // The host's documentation for `start(name, request)` names them: "child label, prompt, parent, signal, and optional
      // capabilities" - and omitting them produced `reading 'aborted'`, i.e. the host reading a signal off the parent it
      // did not receive. The PARENT is the current session, which the host exposes through `ctx.get('agents')` (its own
      // code reads `agent.session` for a child run); the entry is where that service is reachable, so it is resolved at
      // CALL TIME like every other seam here. The SIGNAL is the framework's own: one is created per turn, so a member
      // turn is abortable and a caller that hands in its own still wins.
      let parent = null
      // ★★★ ROUND 71: WHAT THE RESOLUTION ACTUALLY PRODUCED, AND WHAT THE SERVICE OFFERS. The remaining question is
      // whether a plugin can obtain the CALLING Agent at all - the host types the one-shot request's parent as Agent
      // while its agents service lists only ids - and one observation settles it. Both facts are recorded here and, when
      // the parent is unusable, they are carried into the refusal so the diagnosis needs no extra instrumentation.
      try {
        const agents = ctx && typeof ctx.get === 'function' ? ctx.get('agents') : null
        if (agents && typeof agents === 'object') { try { agentKeys = Object.keys(agents).concat(Object.keys(Object.getPrototypeOf(agents) || {})).slice(0, 24) } catch { agentKeys = null } }
        // ★★★★★★★ SLV: WHO DRIVES THIS DEPLOYMENT IS AN ASSEMBLY FACT, NOT A PER-CALL GUESS. A tick/timer delivery is
        // outside any turn initiator boundary, so `currentInitiator()` is unavailable there and the id list may hold
        // several agents. The entry binds the root Agent as soon as the host shows it (a tool call carries `exec.agent`),
        // and this seam accepts it as the parent. A per-call inference is only a FALLBACK for callers that have no binding.
        if (typeof getRootAgent === 'function') {
          try {
            const cand = getRootAgent()
            if (cand && typeof cand === 'object' && cand.options && cand.session) { parent = cand; parentKind = 'bound-root' }
          } catch { /* an unbound deployment keeps the fallbacks below, then fails by name */ }
        }
        if (agents && typeof agents.get === 'function') {
          const id = (typeof config.sessionId === 'string' && config.sessionId) || (typeof config.agentId === 'string' && config.agentId) || null
          if (id && typeof agents.get === 'function') { const cand = agents.get(id); parent = cand || null; parentKind = cand ? (typeof cand === 'object' ? (cand.options ? 'agent' : 'object-without-options') : typeof cand) : 'get-returned-nothing' }
          // ★★★★★★★ SLV MEASURED: the CALLING Agent is the seam's own `currentInitiator()`. When v3 was driven from a
          // real tool turn (`vibe_vmu_turn`), neither a configured session id nor a single-entry list was available, so
          // `parent` stayed null and the host's provider read `null.options` ("the host refused to start this member
          // turn twice on the one-shot path"). The initiating Agent is exactly what this delivery needs, and the host
          // exposes it by name - so ask for it BEFORE guessing from a list of ids.
          if (!parent && typeof agents.currentInitiator === 'function') {
            try {
              const cand = agents.currentInitiator()
              if (cand && typeof cand === 'object' && cand.options && cand.session) { parent = cand; parentKind = 'current-initiator' }
            } catch { /* outside an initiator boundary: keep the list fallback below */ }
          }
          if (!parent && typeof agents.list === 'function') {
            // ★★★ ROUND 70: list() RETURNS IDS, NOT AGENTS. The host's own declaration reads list(): string[], and the
            // one-shot request's parent is typed Agent - an object carrying options and session.header. Taking the
            // first list entry directly therefore passed a STRING where an Agent was required, and the host's
            // delegationDepthOf read gent.options off it: exactly the "Cannot read properties of null (reading
            // 'options')" seen on a real machine. The id must be RESOLVED through get() before it can be a parent.
            const all = agents.list()
            if (Array.isArray(all) && all.length === 1) {
              const resolved = agents.get(String(all[0]))
              // only an object with the fields the host reads is accepted; anything else stays null and is refused by name
              parentKind = resolved === undefined || resolved === null ? 'get-returned-nothing' : (typeof resolved === 'object' ? (resolved.options ? 'agent' : 'object-without-options') : typeof resolved)
              if (resolved && typeof resolved === 'object' && resolved.options && resolved.session) parent = resolved
            }
          }
        }
      } catch { parent = null }
      // ★ THE REVERSE OF THE BINDING: no root Agent is a NAMED refusal, never a silent "nobody worked" tick. The
      // one-shot path needs the parent object (the host reads `.options`/`.session` off it); calling it with null is how
      // a real run produced "the host refused to start this member turn twice: Cannot read properties of null".
      if (configuredProvider && !parent) {
        const err = new Error('no root Agent is bound for this deployment, so a tick-driven member turn has no parent')
        err.code = 'VMU_ENGINE_UNAVAILABLE'
        err.hint = 'bind the deployment root Agent at assembly (the entry does this from the first host tool call); '
          + 'diagnosis: parentKind=' + parentKind + ' agentKeys=' + String(agentKeys)
      throw err
      }
      const signal = (typeof config.deliverSignal === 'object' && config.deliverSignal) || (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined' ? new AbortController().signal : null)
      // ★ SLV / BOUNDED DELIVERY: a one-shot member turn used to occupy the serial dispatch queue FOREVER (measured:
      // inFlight=1 for 40 minutes, failed=0, lastError=null while the whole queue sat behind it). The deadline comes from
      // the declared setting (no literal here); the error carries WHERE the turn stood, so "request never sent" and
      // "sent, no provider event" are distinguishable without another run.
      const timeoutDef = SETTING_DEFS.find((d) => d && d.key === 'vmu.turn.deliveryTimeoutMs')
      const configuredTimeout = Number(settings && settings['vmu.turn.deliveryTimeoutMs'])
      const deliveryTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : Number(timeoutDef && timeoutDef.def)
      if (!(deliveryTimeoutMs > 0)) {
        throw Object.assign(new Error('no delivery deadline is declared'), {
          code: 'VMU_INVALID_ARGUMENT',
          hint: 'the schema must declare vmu.turn.deliveryTimeoutMs (number > 0); an unbounded one-shot delivery can stall the queue forever',
        })
      }
      const startedMs = Date.now()
      const phases = []
      const onPhase = (phase) => { try { phases.push({ phase: String(phase), at: Date.now() - startedMs }) } catch { /* evidence only */ } }
      let timer = null
      // ★ The bridge is a FACTORY: call it once to get the actual deliverer, then call THAT with the turn/text. Racing
      // the factory itself (it returns a function synchronously) made the seam return a function instead of a reply.
      const deliverer = deliverViaSubagents(subs, extract, {
        provider: configuredProvider, parent, signal,
        options: Object.assign({}, (config.deliverOptions && typeof config.deliverOptions === 'object') ? config.deliverOptions : {}, { onPhase }),
      })
      if (typeof deliverer !== 'function') {
        throw Object.assign(new Error('the delivery seam factory did not return a callable deliverer'), { code: 'VMU_ENGINE_UNAVAILABLE' })
      }
      const delivery = Promise.resolve().then(() => deliverer({ turn, text }))
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const waitedMs = Date.now() - startedMs
          const last = phases.length > 0 ? phases[phases.length - 1] : null
          const err = new Error('the one-shot delivery for this member turn did not settle within ' + deliveryTimeoutMs + 'ms')
          err.code = 'VMU_TURN_DELIVERY_TIMEOUT'
          err.turn = turn && turn.id ? turn.id : null
          err.member = turn && turn.member ? turn.member : null
          err.waitedMs = waitedMs
          err.deliveryTimeoutMs = deliveryTimeoutMs
          err.requestSent = last !== null
          err.lastPhase = last ? last.phase : 'before-call'
          err.phases = phases.slice()
          err.hint = 'the turn was started through the one-shot path and never returned; the serial queue is released automatically, and this record says whether the call was entered (' + (last ? 'yes, last phase ' + last.phase : 'no') + ')'
          reject(err)
        }, deliveryTimeoutMs)
      })
      try {
        return await Promise.race([delivery, deadline])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    // ROUND 4 / F9+F10 (docs/26 §3.22): THE ONGOING-COMMAND SEAMS, assembled exactly like the turn-delivery one above -
    // the capability is the host's (`subagents.sendMessage` / `subagents.interrupt`), the bridge is
    // `kernel/turn/index.js`'s, and the service is resolved AT CALL TIME (a plugin's `apply` can run before the
    // subagents service mounts, and binding "absent" now would refuse every command forever). A host without the verb
    // produces the bridge's NAMED refusal; the kernel reports the seam as absent in `status().seams.sendMessage/interrupt`.
  return turnDeliver
}
