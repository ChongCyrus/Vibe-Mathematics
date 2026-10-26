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
    // ★★★ LIVE RUN 42 (the institute's own report, ㉝.1 item (c)2): it set `vmu.turn.deliverMode:"caller"`, the receipt
    // said `applied:"immediate"` / `requiresRestart:false`, and the run kept delivery on activation — because this
    // resolution reads the CONFIG FIRST and is captured here, ONCE, at construction. The mode therefore never had a
    // live reader, and a config-declared mode shadows the setting entirely. Two things now make that readable instead
    // of inferable: the SOURCE is named on the seam (`deliverModeSource`), and the kernel's settings receipt scores this
    // key as construction-read (no live reader) instead of inheriting the blanket `vmu.turn.*` claim.
    const deliverModeSource = (config.vmu && typeof config.vmu.deliverMode === 'string' && config.vmu.deliverMode)
      ? 'config.vmu.deliverMode'
      : ((typeof config.deliverMode === 'string' && config.deliverMode) ? 'config.deliverMode'
        : ((settings && typeof settings['vmu.turn.deliverMode'] === 'string' && settings['vmu.turn.deliverMode'] !== '')
          ? 'setting:vmu.turn.deliverMode' : 'default:subagents'))
    if (declaredDeliverMode !== 'subagents' && declaredDeliverMode !== 'caller') {
      const err = new Error('unknown delivery mode: ' + String(declaredDeliverMode))
      err.code = 'VMU_INVALID_ARGUMENT'
      err.hint = 'vmu.turn.deliverMode (or config.deliverMode) is either "subagents" - the host runs the member turn - or "caller" - the calling session plays it and returns the reply through vibe_vmu_turn { reply }'
      throw err
    }
    const callerSeam = declaredDeliverMode === 'caller' ? deliverByReturning() : null
    // Attached to whichever seam object is returned, so a diagnostic can answer "why did setting
    // vmu.turn.deliverMode change nothing?" from a reading instead of from re-deriving the precedence in source.
    const withMode = (seam) => {
      try {
        seam.deliverMode = declaredDeliverMode
        seam.deliverModeSource = deliverModeSource
        seam.deliverModeMeans = 'the mode was resolved ONCE, at construction, reading ' + deliverModeSource +
          ' - a config-declared mode shadows the setting vmu.turn.deliverMode, so a runtime write to that key cannot change this seam'
      } catch { /* a frozen seam keeps its behaviour; these fields are a reading, not a capability */ }
      return seam
    }

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
  if (callerSeam) return withMode(callerSeam)
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
      // ★★★★★★★ THE MEMBER SEAT (goal round 3). The host's start request has exactly three per-child knobs —
      // `cwd`, `agentPreset`, `outputSchema` — and the measured escape (a member session making 58 `pwsh` calls,
      // including reading the harness's own `app.asar`) can only be closed at CREATION time. So the preset name is a
      // declared setting, forwarded onto the request; `''` (the declared default) means "inherit the caller's preset",
      // which keeps every existing deployment byte-identical. The member preset itself is generated from a table
      // (`scripts/build-preset-rows.mjs` `MEMBER_DROP`) and gated by `tests/vmu-member-preset.test.mjs`.
      // ★★★★★★★ MEASURED DEFECT (2026-10-25, the run that was supposed to prove this seat): the first version of this
      // reader looked at `config.deliverPreset` and the SETTING only — while a real deployment (the SLV runner) declares
      // it the same way it declares the mode, i.e. `config.vmu.deliverPreset`. The run therefore delivered member turns
      // with NO preset and the member sessions still ran 52 `pwsh` calls in total. This is the SAME trap the mode
      // reader above records ("a mode declared under `vmu` was invisible"), repeated one line lower in the same file:
      // the gate was green because it tested the setting path, which the deployment never uses.
      const declaredPreset = (config.vmu && typeof config.vmu.deliverPreset === 'string' && config.vmu.deliverPreset)
        || (typeof config.deliverPreset === 'string' && config.deliverPreset)
        || (settings && typeof settings['vmu.turn.childPreset'] === 'string' && settings['vmu.turn.childPreset'])
        || null
      const configuredPreset = typeof declaredPreset === 'string' && declaredPreset !== '' ? declaredPreset : null
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
      let graceTimer = null
      // ★ The bridge is a FACTORY: call it once to get the actual deliverer, then call THAT with the turn/text. Racing
      // the factory itself (it returns a function synchronously) made the seam return a function instead of a reply.
      const deliverer = deliverViaSubagents(subs, extract, {
        provider: configuredProvider, parent, signal, agentPreset: configuredPreset,
        options: Object.assign({}, (config.deliverOptions && typeof config.deliverOptions === 'object') ? config.deliverOptions : {}, { onPhase }),
      })
      if (typeof deliverer !== 'function') {
        throw Object.assign(new Error('the delivery seam factory did not return a callable deliverer'), { code: 'VMU_ENGINE_UNAVAILABLE' })
      }
      // ★★★★★★★ TASK-16: THE REPLY-CAPABLE RESUME, HANDED TO THE SEAM AS ITS THIRD ARGUMENT. Task-13 taught the seam to
      // READ the continuation offer (`turn.continuation.session`) and to use a caller-supplied `child` resume when one is
      // passed - but nothing in production passed one, so every run still opened a new child per turn. The factory below
      // composes the three documented host capabilities that together DO return the child's answer (see its own header);
      // `null` means this host cannot do it, and then the seam starts a fresh child and says so in its `continuation`
      // reading instead of implying continuity it never got. Built per call because the parent, the deadline and the
      // cancellation are per-call facts.
      const resumeCapability = memberResumeCapability({ ctx, subs, parent })
      const resumeChild = makeMemberResumeChild({ ctx, subs, parent, deadlineMs: Math.max(250, Math.floor(deliveryTimeoutMs * 0.98)) })
      // The capability probe travels ON the turn (the only channel host-deliver and the seam share, because the seam's
      // factory is called once and its deliverer is called per turn): the kernel's `continuation` reading then names the
      // missing piece instead of only saying "this host offers no reply-capable continuation".
      const turnForSeam = turn && typeof turn === 'object'
        ? Object.assign({}, turn, { continuationCapability: resumeCapability })
        : turn
      const delivery = Promise.resolve().then(() => deliverer({ turn: turnForSeam, text, child: resumeChild || undefined }))
      // ★★★★★★★ LIVE RUN 2026-10-25 (the institute's own defect note): THE DEADLINE IS NOT A FAILURE VERDICT.
      // MEASURED: a real member turn (a subagent that really ran) settled at 197 913 ms against a 180 000 ms deadline.
      // The child had FINISHED - it had written its Lean file, its proposition card and its progress file - but the turn
      // was reported as VMU_TURN_DELIVERY_TIMEOUT with `receipt:null`, so a completed agent turn (the most expensive object
      // in this system) was thrown away and the caller was told nothing happened. The deadline must stay BOUNDED (an
      // unbounded one-shot delivery stalls the serial queue forever - that was the reason it exists), so the fix is not
      // "wait longer": it is ONE bounded grace window, and if the delivery settles inside it the reply is HARVESTED and
      // the receipt says so. Nothing is hidden: `deliveredLate` + the two windows travel on the reply.
      const TIMEOUT = Symbol('delivery-timeout')
      const startedMsLocal = startedMs
      const after = (ms) => new Promise((resolve) => {
        const t = setTimeout(() => resolve(TIMEOUT), ms)
        if (ms === deliveryTimeoutMs) timer = t
        else graceTimer = t
      })
      const timeoutError = (waitedMs, extra = {}) => {
        const last = phases.length > 0 ? phases[phases.length - 1] : null
        const err = new Error('the one-shot delivery for this member turn did not settle within ' + deliveryTimeoutMs + 'ms' +
          (extra.graceMs ? ' (+' + extra.graceMs + 'ms grace)' : ''))
        err.code = 'VMU_TURN_DELIVERY_TIMEOUT'
        err.turn = turn && turn.id ? turn.id : null
        err.member = turn && turn.member ? turn.member : null
        // ★★★★★★★ LIVE RUN 2026-10-25 (the institute's own reading): the receipts jumped from round 1 to round 3 and
        // NOTHING said whether round 2 had been consumed by the timed-out turn. A reader cannot tell "the round is gone"
        // from "the round is still owed". The turn's ordinal is therefore carried, with an explicit statement that it was
        // allocated and NOT completed - the honest answer, because the pump advanced past it.
        err.round = turn && Number.isFinite(turn.round) ? turn.round : (turn && Number.isFinite(turn.turn) ? turn.turn : null)
        err.roundConsumed = true
        err.roundCompleted = false
        err.waitedMs = waitedMs
        err.deliveryTimeoutMs = deliveryTimeoutMs
        if (extra.graceMs) err.deliveryGraceMs = extra.graceMs
        err.requestSent = last !== null
        // ★ LIVE RUN 12 (the institute's own report, item 1): the timeout receipt carried no `deliveryPath`, so a
        // reader could not tell whether the turn had been attempted through the one-shot path, the activation path
        // or the continuable fallback. This seam IS the one-shot path, so it says so - and says what that excludes.
        err.deliveryPath = 'one-shot'
        err.deliveryPathMeans = 'this call used the ONE-SHOT path (subagents.start): a single request whose answer must come back inside the deadline. The activation and continuable paths were NOT tried, so a timeout here does not mean the host has no way to run a member turn - it means this request did not return in time'
        err.lastPhase = last ? last.phase : 'before-call'
        err.phases = phases.slice()
        // ★★★★★★★ LIVE RUN 51 residue 2 (the institute's own note): A DEADLINE IS NOT A VERDICT ON THE CHILD'S WORK.
        // MEASURED: the turn was reported as VMU_TURN_DELIVERY_TIMEOUT with `receipt:null` while the child was STILL
        // RUNNING and had already written `Formal/p1.lean`; the office read "nothing happened" and planned to throw the
        // work away. The child is NOT cancelled by this deadline - the one-shot window bounds this CALL, not the child
        // session - so the honest receipt carries what IS known (which turn, which child member, how long, how far the
        // delivery got) and states plainly that artifacts may still be landing.
        err.partial = {
          turnId: err.turn,
          member: err.member,
          elapsedMs: waitedMs,
          requestSent: last !== null,
          lastPhase: last ? last.phase : 'before-call',
          childId: null,
          childIdMeans: 'this face does not learn the child session id unless the delivery settles, so it cannot name it here; the child is the one this member turn was delegated to and its session id appears on the SETTLED receipt (delivery.childId) if this turn is collected later',
        }
        err.stillRunning = true
        err.stillRunningMeans = 'the one-shot deadline bounded THIS CALL, not the child session: the child was not cancelled by it, so files it writes after this refusal are real and may still appear'
        err.workspaceHint = 'read the member\'s own files (read_library / the record tracks) before concluding the turn produced nothing: in the measured run the child had already written its Lean file when this deadline fired'
        err.hint = 'the turn was started through the one-shot path and never returned; the serial queue is released automatically, and this record says whether the call was entered (' + (last ? 'yes, last phase ' + last.phase : 'no') + ')' +
          '. The round ordinal is carried (`round`) because the pump advances past a turn it cannot settle: `roundConsumed`/`roundCompleted` say the number was allocated and the round was NOT completed, so a gap in the receipts is a timed-out round rather than a lost record' +
          (extra.graceMs ? '. A turn that settles inside the grace window is harvested instead of timed out' : '')
        return err
      }
      try {
        // ★★★★★★★ THE SEAT IS A READING, NOT AN INFERENCE (2026-10-25): the first seat run was inert because the
        // deployment declares the preset under `vmu:` — and nobody could SEE that from the receipt, so the only way to
        // find out was a 15-minute transcript histogram. Every successful delivery now carries the seat it requested
        // (`null` = inherit), so the next run answers "did the preset reach the child" by reading one receipt.
        const withSeat = (v) => {
          const b = v && typeof v === 'object' ? v : { reply: v }
          return Object.assign({}, b, {
            childPreset: configuredPreset,
            childPresetMeans: 'the agentPreset this face put on the child CREATION request; null means "inherit the caller\'s preset" - it is not a claim that the host accepted it',
          })
        }
        const first = await Promise.race([delivery.then((v) => ({ v })), after(deliveryTimeoutMs)])
        if (first !== TIMEOUT) return withSeat(first.v)
        const graceMs = Math.max(1000, Math.round(deliveryTimeoutMs / 4))
        const late = await Promise.race([delivery.then((v) => ({ v })), after(graceMs)])
        if (late !== TIMEOUT) {
          const waitedMs = Date.now() - startedMsLocal
          const base = withSeat(late.v)
          return Object.assign({}, base, {
            deliveredLate: true,
            deliveryWaitedMs: waitedMs,
            deliveryDeadlineMs: deliveryTimeoutMs,
            deliveryGraceMs: graceMs,
            attribution: (base.attribution ? base.attribution + '; ' : '') +
              'the turn settled AFTER the ' + deliveryTimeoutMs + 'ms deadline but inside the ' + graceMs + 'ms grace window, so it was HARVESTED rather than reported as a timeout (waited ' + waitedMs + 'ms)',
          })
        }
        throw timeoutError(Date.now() - startedMsLocal, { graceMs })
      } finally {
        if (timer) clearTimeout(timer)
        if (graceTimer) clearTimeout(graceTimer)
      }
    }
    // ROUND 4 / F9+F10 (docs/26 §3.22): THE ONGOING-COMMAND SEAMS, assembled exactly like the turn-delivery one above -
    // the capability is the host's (`subagents.sendMessage` / `subagents.interrupt`), the bridge is
    // `kernel/turn/index.js`'s, and the service is resolved AT CALL TIME (a plugin's `apply` can run before the
    // subagents service mounts, and binding "absent" now would refuse every command forever). A host without the verb
    // produces the bridge's NAMED refusal; the kernel reports the seam as absent in `status().seams.sendMessage/interrupt`.
  return withMode(turnDeliver)
}

// ★★★★★★★ TASK-16 / LIVE RUN 31 (the institute's own defect note): THE MEMBER TURN, RESUMED IN THE MEMBER'S OWN SESSION.
// WHAT RUN 31 SAID: twelve member turns, and `acad-01` and `res-01` each ran in TWO different child sessions — one new
// session per turn, so no member had cross-turn memory, while the v5r pack asks every researcher to推进 its own line and
// to 归档 progress/已尝试路线. Task-13 gave the delivery seam the reading (`turn.continuation.session`) and the application
// (a caller-supplied `child({session,text,turn}) => {reply}`), but nothing in production passed one, so the receipt could
// only say `applied:false, cause:'no-reply-capable-resume'`.
// WHAT THE HOST ACTUALLY OFFERS (measured on DSH 0.2.1, the bundle this host runs — the shipped `subagents` service):
//   · `startActivation({ childId })` treats the id as a RESERVED IDENTITY for a NEW child; the manager's
//     `assertChildIdAvailable` throws `DUPLICATE_CHILD` for an existing id. Not a resume.
//   · `sendMessage(sender, target, content)`, `prompt(request)`, `queuePrompt`, `steerPrompt` and the cold-resume path all
//     resolve to an inbox MessageId — the shipped manager's own comment says "later execution is independent of this call"
//     — so none of them can hand a reply back through `deliver({turn,text}) => reply`.
//   · `startContinuable` does NOT exist on this host (`grep` over the shipped service, manager and index: 0 hits).
// SO THERE IS NO VERB. There is a COMPOSITION of three documented capabilities, and that is what this factory returns:
//   1. `subagents.prompt({ parentSessionId, childSessionId, mode:'continuable', delivery:'queue', content })` admits a
//      next-turn prompt into the member's OWN session. A child that is not resident is cold-resumed from persistence —
//      the host writes every locally started child's descriptor as `mode:'continuable'`, which is exactly the descriptor
//      the cold-resume path requires (`NOT_RESUMABLE` otherwise).
//   2. `ctx.get('agents').get(childSessionId).whenIdle()` is the host's documented quiescence await ("whenIdle() resolves
//      after the whole agent reaches quiescence"), i.e. the completion signal the inbox id does not carry.
//   3. `ctx.get('sessionQuery').observeSession(childSessionId, { projectionMode:'none' })` reads that session's log; the
//      answer is the last non-empty `assistant/message` after the new `turn/end` — the same selection rule the host's own
//      subagent backend applies in its `assistant-output` module. The log is a SNAPSHOT, so it is re-read, never subscribed.
// The child is left RESIDENT after the resume: residency is what makes `whenIdle()` meaningful on the next turn, and vmu
// has one child per member, so residency stays bounded by the roster.
// ★ KNOWN BOUNDARY (task-16 裁决 3): the host's own cap is `maxActiveSubagents` (default 8), and every continued member
// holds one resident child — a roster LARGER than that cap would need a host-side `drainChildren`/dispose policy, which is
// NOT IMPLEMENTED here. The cap is not fought silently: past capacity the host refuses with `ACTIVATION_LIMIT_REACHED` /
// `subagent/delivery-unavailable`, this factory turns that into a named resume refusal, and the seam then downgrades the
// turn EXPLICITLY (task-16 裁决 1) instead of failing it.
// `null` means this deployment cannot do it (no `subagents.prompt`, no `agents.get`, no `sessionQuery`, or no live parent
// session). Then the seam starts a fresh child exactly as before and its `continuation` reading says `applied:false` with
// the missing pieces named — never a claim of continuity that did not happen.
function contextService(ctx, key) {
  try {
    return ctx && typeof ctx.get === 'function' ? (ctx.get(key) || null) : null
  } catch {
    return null
  }
}

function sessionIdOf(agent) {
  const session = agent && agent.session ? agent.session : null
  if (!session) return null
  const header = session.header && typeof session.header === 'object' ? session.header : null
  const id = session.id || (header && header.id) || null
  return typeof id === 'string' && id !== '' ? id : null
}

function messageOf(error) {
  return String((error && error.message) || error || 'unknown error')
}

function namedError(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (typeof hint === 'string' && hint !== '') err.hint = hint
  return err
}

// Which pieces of the composed resume this deployment actually has. Exported because the facade reports it on the
// continuation reading: "the host cannot resume" is a measurement, and a reader must be able to see WHICH piece is absent.
export function memberResumeCapability({ ctx = null, subs = null, parent = null } = {}) {
  const missing = []
  if (!subs || typeof subs.prompt !== 'function') missing.push('subagents.prompt')
  const agents = contextService(ctx, 'agents')
  if (!agents || typeof agents.get !== 'function') missing.push('agents.get')
  const query = contextService(ctx, 'sessionQuery')
  if (!query || typeof query.observeSession !== 'function') missing.push('sessionQuery.observeSession')
  const parentSessionId = sessionIdOf(parent)
  if (parentSessionId === null) missing.push('a live parent session id (getRootAgent bound a root Agent)')
  const capable = missing.length === 0
  return {
    capable,
    missing,
    verb: typeof (subs && subs.prompt) === 'function' ? 'subagents.prompt({ mode:"continuable", delivery:"queue" })' : null,
    parentSessionId,
    means: capable
      ? 'this deployment can resume a member in its OWN session: `subagents.prompt` admits the next-turn prompt, `agents.get(id).whenIdle()` is the completion await, and `sessionQuery.observeSession(id)` reads the answer back out of that session\'s log'
      : 'this deployment cannot resume a member in its own session: the composed resume needs ' + ['subagents.prompt', 'agents.get().whenIdle()', 'sessionQuery.observeSession()', 'a live parent session']
        .filter((p) => missing.some((m) => m.indexOf(p.slice(0, 8)) === 0)).join(' + ') + '; missing=[' + missing.join(', ') + ']. A member turn therefore starts a FRESH child per turn, exactly as before',
  }
}

export function makeMemberResumeChild({ ctx = null, subs = null, parent = null, deadlineMs = 180000, sleep = null, clock = null } = {}) {
  const capability = memberResumeCapability({ ctx, subs, parent })
  if (!capability.capable) return null
  const agents = contextService(ctx, 'agents')
  const query = contextService(ctx, 'sessionQuery')
  const parentSessionId = capability.parentSessionId
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const now = typeof clock === 'function' ? clock : () => Date.now()
  const budgetMs = Number.isFinite(Number(deadlineMs)) && Number(deadlineMs) > 0 ? Math.floor(Number(deadlineMs)) : 180000
  const pollMs = 200

  const leaseOf = async (childId) => {
    const lease = await query.observeSession(childId, { projectionMode: 'none' })
    return lease || null
  }
  const releaseOf = (lease) => {
    if (!lease || typeof lease !== 'object') return
    try {
      if (typeof lease[Symbol.dispose] === 'function') lease[Symbol.dispose]()
      else if (typeof lease.dispose === 'function') lease.dispose()
    } catch { /* a lease that cannot be released must not fail the turn */ }
  }
  const cursorOf = (lease) => {
    const cursor = Number(lease && lease.cursor)
    return Number.isFinite(cursor) ? cursor : -1
  }
  const segmentOf = async (childId, baselineSeq) => {
    const lease = await leaseOf(childId)
    try {
      const events = lease && Array.isArray(lease.events) ? lease.events : []
      return events.filter((event) => Number(event && event.seq) > baselineSeq)
    } finally {
      releaseOf(lease)
    }
  }

  return async function resumeMemberChild({ session, text, turn } = {}) {
    const childId = typeof session === 'string' && session !== '' ? session : null
    if (childId === null) {
      throw namedError('VMU_INVALID_ARGUMENT', 'a continuation resume was asked for without a session id',
        'the seam passes `turn.continuation.session`; an empty one means the kernel offered nothing, so nothing can be resumed')
    }
    const startedMs = now()
    let baselineSeq
    try {
      const lease = await leaseOf(childId)
      try { baselineSeq = cursorOf(lease) } finally { releaseOf(lease) }
    } catch (e) {
      throw namedError('VMU_ENGINE_UNAVAILABLE',
        'the member session "' + childId + '" could not be read before resuming it: ' + messageOf(e),
        'continuation reads the session log BEFORE the prompt so it can tell the resumed turn\'s events from the old ones; cause='
          + String((e && e.code) || 'unknown') + '. Check that the sessionQuery service is loaded and that the session is live or persisted')
    }
    const requestId = 'vmu-cont-' + String((turn && (turn.id || turn.member)) || 'turn') + '-' + Date.now()
    let accepted = null
    try {
      accepted = await subs.prompt({
        parentSessionId,
        childSessionId: childId,
        mode: 'continuable',
        delivery: 'queue',
        requestId,
        content: [{ type: 'text', text: String(text) }],
      })
    } catch (e) {
      const hostCode = String((e && e.code) || '')
      const hints = {
        'subagent/not-resumable': 'the host refused to resume "' + childId + '": it has no continuation state recorded. The host writes `mode:"continuable"` for children IT starts locally, so this session was started another way (or is not a child of this parent) and cannot be resumed — vmu must start that member through the activation path first',
        'subagent/parent-unavailable': 'the root Agent that owns the member is no longer live (parent session "' + parentSessionId + '"), so the host will not admit a prompt into its child. This is the office session having closed, not a missing member',
        'subagent/unauthorized': 'the host refused the resume as unauthorized: the prompt must come from the member\'s exact live parent Agent',
        'subagent/delivery-unavailable': 'the host had no delivery slot for this child (its active-subagent cap is reached) or no continuation state. Nothing was started and nothing was lost — the next turn can try again',
        CONTINUATION_UNAVAILABLE: 'the host has no session query service (load @deepseek-ai/dsh-session-query), so a cold child cannot be resumed',
      }
      throw namedError('VMU_ENGINE_UNAVAILABLE',
        'the host refused to admit a continuation prompt into the member session "' + childId + '"' + (hostCode ? ' (' + hostCode + ')' : '') + ': ' + messageOf(e),
        (hints[hostCode] || 'the continuation prompt was not admitted; the member did NOT run this turn') + (typeof e === 'object' && e && e.hint ? ' — host hint: ' + e.hint : ''))
    }
    for (;;) {
      const child = agents.get(childId)
      if (child && typeof child.whenIdle === 'function') {
        try { await child.whenIdle() } catch { /* the log below is the authority on whether the turn ended */ }
      }
      const segment = await segmentOf(childId, baselineSeq)
      if (segment.some((event) => event && event.type === 'turn/end')) {
        const reply = assistantReplyText(segment)
        if (reply !== null) {
          const waitedMs = now() - startedMs
          return {
            reply,
            childId,
            stopReason: null,
            acceptedMessageId: accepted && typeof accepted.messageId === 'string' ? accepted.messageId : (typeof accepted === 'string' ? accepted : null),
            waitedMs,
            attribution: 'continuation: the prompt was queued into the member\'s OWN session (' + childId
              + ') through `subagents.prompt` (mode "continuable", delivery "queue"), the resumed turn ended, and its final assistant text was read back out of that session\'s log after '
              + String(waitedMs) + 'ms — no new child was started',
          }
        }
        throw namedError('VMU_ENGINE_UNAVAILABLE',
          'the resumed member turn in session "' + childId + '" ended without any assistant text',
          'the child DID run and DID end its turn — this is a reading failure on the way back, not a missing member answer. The usual cause is a turn that only made tool calls; read that child session\'s log (its last `assistant/message`) before concluding the member said nothing')
      }
      const waitedMs = now() - startedMs
      if (waitedMs >= budgetMs) {
        const err = namedError('VMU_TURN_DELIVERY_TIMEOUT',
          'the continuation of member session "' + childId + '" did not end within ' + budgetMs + 'ms',
          'the prompt WAS admitted into the member\'s own session, so the member may still be working: this deadline bounded THIS CALL, not the child. Do not conclude the turn produced nothing — read the child session log (' + childId + ') and the member\'s files')
        err.deliveryPath = 'continuation'
        err.childId = childId
        err.waitedMs = waitedMs
        err.deliveryTimeoutMs = budgetMs
        err.stillRunning = true
        throw err
      }
      await wait(pollMs)
    }
  }
}

// The answer-selection rule of the host's own subagent backend (`assistant-output`): the LAST non-empty
// `assistant/message` after the new turn, falling back to the accumulated streamed text of `assistant/message` /
// `assistant/attempt` records when no complete message was recorded.
function assistantReplyText(events) {
  let settled = null
  const streamed = []
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue
    const data = event.data && typeof event.data === 'object' ? event.data : null
    if (!data) continue
    if (event.type === 'assistant/message') {
      const content = data.message && Array.isArray(data.message.content) ? data.message.content : null
      const text = content ? textOfReplyBlocks(content) : ''
      if (text !== '') settled = text
      streamed.push(streamText(data.stream))
    } else if (event.type === 'assistant/attempt') {
      streamed.push(streamText(data.stream))
    }
  }
  if (settled !== null) return settled
  const joined = streamed.join('')
  return joined === '' ? null : joined
}

function textOfReplyBlocks(blocks) {
  const parts = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') continue
    if (typeof block.text === 'string' && (block.type === undefined || block.type === 'text')) parts.push(block.text)
  }
  return parts.join('')
}

function streamText(stream) {
  const parts = []
  for (const record of Array.isArray(stream) ? stream : []) {
    if (!record || typeof record !== 'object') continue
    if (record.type === 'text-chunks' && Array.isArray(record.texts)) parts.push(record.texts.join(''))
    else if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('')
}
