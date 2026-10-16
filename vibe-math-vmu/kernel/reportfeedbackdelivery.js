// vmu kernel · reportfeedbackdelivery — THE DELIVERY CALL FOR THE REPORT-FEEDBACK LOOP (A1 step 1, Part B).
//
// WHY THIS FILE EXISTS. The reporting face records reports and, until now, nothing came back: the report domain's
// default channel is `log` ("recorded only", `kernel/report.js`) and its default recipients are empty, so a report had
// an audience in name only and no path back to the model. Three behavioural rounds measured that: six sessions, ZERO
// spontaneous reports, while six of six outputs contained something worth reporting. The missing piece was the LOOP.
//
// WHAT IT OWNS. One call: register a dynamic context entry on the host service so the model can see, on the next turn,
// that a report happened and who it was for. It decides between four outcomes and returns the nine-key receipt state:
//   · the switch is OFF                     -> zero mechanism: nothing delivered, and NO invented failure;
//   · the switch is ON with NO AUDIENCE     -> a NAMED failure (`REPORT_FEEDBACK_WHAT_AUDIENCE`). The settings key's own
//     documentation promises this, so staying silent would make the declaration untrue;
//   · the host cannot take the call (unreachable, or no `.context`) -> a NAMED failure with the stack, reusing the
//     already-registered `VMU_EXTERNAL_UNAVAILABLE`, exactly like the prompt-section degradation in the entry;
//   · otherwise                             -> `delivered:true`, `registered:true`.
//
// WHAT IT DOES NOT OWN (named, not implied).
//   · it does NOT read the settings itself. ★ THE CALLER READS THEM AND PASSES THEM IN, AND THAT IS A CORRECTION, NOT A
//     PREFERENCE. The first version derived the switch from the report face's OWN RECEIPT - and that receipt is produced
//     by asking the provider this very state is handed back through, so the delivery was reading a value it had itself
//     produced: it saw an empty receipt, concluded "off", and wrote "off" back, pinning the switch shut while every
//     suite stayed green. The caller now reads the kernel's RESOLVED settings, a source that owes nothing to the receipt.
//   · it does NOT decide the position of the entry: the order is `REPORT_FEEDBACK_CONTEXT_ORDER`, an explicit finite
//     number chosen in `kernel/reportfeedback.js` because the host takes the order FROM THE CALLER.
//   · it does NOT deliver policy text. The payload is a RUNTIME SNAPSHOT - counts and the audience - and it says in
//     words that it is a delivery notice and not an instruction. Writing feedback as policy would re-pollute the very
//     distinction the behaviour experiments separated, which is why the dynamic-context channel was chosen at all.
//   · it does NOT survive a missing host service as silence: that is a NAMED failure. A service that cannot be reached
//     and a switch that is genuinely off must never be indistinguishable.
//
// ZERO MECHANISM: two exported functions, both taking their dependencies explicitly - `deliverReportFeedbackFrom` (reads
// the assembled kernel and hands back the state; the entry's one line, because its 1200-line budget is counted by
// `split('\n')`) and `deliverReportFeedback` (the delivery itself, `{ ctx, effect, status, enabled, audience }`) - no
// `create*` factory, no service, nothing to probe. The matrix therefore registers this module `EXPECT_NA`.
import { REPORT_FEEDBACK_CONTEXT_NAME, REPORT_FEEDBACK_CONTEXT_ORDER, REPORT_FEEDBACK_WHAT_AUDIENCE, REPORT_FEEDBACK_WHAT_CONTEXT } from './reportfeedback.js'

/** The code reused for every "the host could not take it" outcome. Already registered: nothing new is invented here. */
const UNAVAILABLE = 'VMU_EXTERNAL_UNAVAILABLE'

/**
 * ENTRY-FACING WRAPPER: read everything the delivery needs from the assembled kernel and hand back the state. The entry
 * keeps ONE line because its 1200-line budget is measured by the same `split('\n')` the code-size gate uses, and this
 * block was what pushed it over - so the reads belong here with the call they serve.
 *
 * ★ THE SWITCH COMES FROM THE KERNEL'S **RESOLVED** SETTINGS AND NEVER FROM THE REPORT FACE'S RECEIPT. That receipt is
 * built by consulting the provider this state is handed back through, so deriving the switch from it is a CYCLE: the
 * delivery reads a value it produced itself, concludes the switch is off, and writes "off" back - pinning it shut while
 * every suite stays green. Two independent instruments caught exactly that (in-process and on a real machine), where the
 * settings said true/config and the delivery said false/default, silently. The resolved map is computed from the
 * settings chain and does not depend on the receipt at all.
 */
export function deliverReportFeedbackFrom({ kernel = null, ctx = null, effect = null } = {}) {
  let status = null
  let resolved = {}
  try {
    if (kernel && kernel.report) status = kernel.report.status()
    const st = kernel && typeof kernel.status === 'function' ? kernel.status() : null
    resolved = (st && st.settings && st.settings.resolved) || {}
  } catch (e) { /* never fatal: an absent face or map means the switch reads as off */ }
  const value = (k) => { const e = resolved[k]; return e && typeof e === 'object' && 'value' in e ? e.value : undefined }
  // The layer that armed the switch, taken from the SAME resolved entry the value came from, so the receipt can never
  // claim a layer the value did not come from. This is what makes "a pack default is genuinely folded AND its origin is
  // visible in the receipt" checkable rather than asserted.
  const layer = (k) => { const e = resolved[k]; return e && typeof e === 'object' && typeof e.source === 'string' ? e.source : null }
  const audience = value('vmu.report.audience')
  return deliverReportFeedback({ ctx, effect, status,
    enabled: value('vmu.report.feedback') === true,
    audience: typeof audience === 'string' ? audience : null,
    source: layer('vmu.report.feedback') })
}

/**
 * ★ `enabled` AND `audience` ARRIVE AS ARGUMENTS, AND THAT IS NOT A STYLE CHOICE - IT BREAKS A CYCLE. The first version
 * derived them from the report face's OWN receipt. But that receipt is built by consulting the provider this very state
 * is handed back through, so the delivery was reading a value it had itself produced: it saw an empty receipt,
 * concluded the switch was off, and wrote "off" back into the receipt - permanently pinning the switch CLOSED, with
 * every suite still green because nothing tied "configured on" to "delivery happened". An independent reviewer
 * localized it to that single read and reproduced it end to end (before: enabled:true, context() called; after:
 * enabled:false, context() never called). The values are therefore read by the CALLER from the kernel's RESOLVED
 * settings and passed in - a source that does not depend on the receipt at all.
 *
 * `status` is still taken, but ONLY for the snapshot's counts. `ctx` and `effect` are the entry's own: it is the only
 * holder of the host prompt service, which is why this call lives there rather than in the report domain.
 */
export function deliverReportFeedback({ ctx = null, effect = null, status = null, enabled = false, audience = null, source = null } = {}) {
  const isOn = enabled === true
  const who = typeof audience === 'string' && audience ? audience : null
  // ★ THE SOURCE IS THE LAYER THAT ACTUALLY ARMED THE SWITCH, PASSED IN - NEVER A LITERAL. It used to read
  // "settings:vmu.report.feedback" whenever the switch was on, and that becomes a FALSE statement the moment the value
  // arrives from anywhere else: a pack default folded in before construction, or a deployment's config. The kernel
  // already computes exactly this provenance - `resolved[key].source` is a pack id, a writer label, an entry-side layer
  // label, `config`, or `default` - and its own comment says a resolved view that misnames the layer is WORSE THAN
  // NONE, which is the same rule one layer up. `null` is what we say when no caller attributed it: the absence of a
  // layer, not a guessed one. Note the OFF case is attributed too: "the schema default" and "config said false" are
  // different facts, and the passed source tells them apart.
  // ★ A NAMED LAYER ALWAYS WINS, WHETHER THE SWITCH ENDED UP ON OR OFF: config saying "false" and the schema default
  // saying nothing are DIFFERENT FACTS, and the receipt should not flatten them. Only when no caller named a layer do we
  // fall back: OFF is then attributed to the default layer (which really is what is in force), while an ARMED switch
  // gets `null` (unattributed) - it was armed by SOMETHING, and borrowing the name of a layer that may not have been
  // involved is the misnaming this project refuses.
  const armed = (typeof source === 'string' && source) ? source : (isOn ? null : 'default')
  const base = { enabled: isOn, source: armed, audience: who, delivered: false, registered: false, code: null, what: null, reason: null, stack: null }

  const named = (what, reason, e) => Object.assign({}, base, {
    code: UNAVAILABLE, what, reason, stack: e ? String((e && e.stack) || '') : null,
  })
  const complain = (reason, e) => {
    try {
      process.stderr.write('vmu: report feedback not delivered - ' + reason + (e ? ': ' + String((e && e.message) || e) : '') + '\n')
    } catch { /* stderr may be gone; the receipt still carries the failure */ }
  }

  if (!isOn) return base                                     // zero mechanism: off means nothing, not a failure
  if (!who) return named(REPORT_FEEDBACK_WHAT_AUDIENCE, 'feedback is on but no audience is named')

  let host = null
  let accessFailed = null
  // ★ READ THE SERVICE WITHOUT REQUIRING IT (the same correction as the entry): `ctx.get(...)` is documented as reading
  // a service WITHOUT the inject requirement and answers `undefined` when it is not provided, where a property access
  // would THROW. The try/catch stays because the no-throw guarantee is cordis's, not every host's.
  //
  // ★ AND THE TWO FAILURES MUST STAY TELLABLE APART, because they mean different things to whoever reads the receipt:
  // the service was NOT OBTAINED (nothing was provided - this branch), versus OBTAINED BUT THE CALL WAS REFUSED (the
  // service is there and refuses this caller - the final catch below). They carry different `reason` strings for that
  // purpose. Neither of them means "the model chose not to use the channel".
  try {
    // ★ BOTH HOST FORMS, `get` FIRST AND THE PROPERTY AS FALLBACK. Reading only through `get` would kill this channel on
    // a host that exposes the service as a property and implements no `get` - measured, not hypothesised. The property
    // form is the one that THROWS when the service was never injected, so the try/catch stays.
    if (ctx && typeof ctx.get === 'function') host = ctx.get('systemPrompt')
    if (!host) host = ctx && ctx.systemPrompt ? ctx.systemPrompt : null
  } catch (e) { accessFailed = e }
  if (accessFailed) {
    // THE READ ITSELF THREW: not the same as "no service", so it gets its own `what` and carries the stack.
    const out = named('systemPrompt', 'the host systemPrompt service could not be READ (not injected?)', accessFailed)
    complain(out.reason, accessFailed)
    return out
  }
  if (!host) {
    // ★ `ctx.get` ANSWERED `undefined`, AND THAT AMBIGUITY BELONGS TO THE API: it means "never provided" OR "provided but
    // its providing fiber is not currently active", and no caller can tell those two apart. So the reason names BOTH
    // possibilities. Saying "the host has no systemPrompt.context()" here would be a FALSE statement about the host -
    // and a receipt that is named but untrue is worse than one that admits it cannot tell which of two things happened.
    const out = named('systemPrompt', 'no host systemPrompt service was obtained: either none is provided, or one is provided but its providing fiber is not currently active (ctx.get cannot distinguish these)')
    complain(out.reason, null)
    return out
  }
  // The prompt-section path tests `.section` only, and the service may carry `.context` without it, so the capability
  // this call needs is checked HERE, by name, rather than inferred from a sibling method. ★ THIS IS THE ONLY BRANCH THAT
  // MAY HONESTLY CLAIM THE HOST LACKS `.context`, because it is the only one holding a service to inspect.
  if (typeof host.context !== 'function') {
    const out = named('systemPrompt.context', 'the host provided a systemPrompt service that carries no .context() to deliver report feedback')
    complain(out.reason, null)
    return out
  }

  try {
    const run = () => {
      const s = status || {}
      const text = '[vmu report feedback] audience: ' + who +
        ' · reports declared: ' + (s.declared || 0) +
        ' · recorded: ' + ((s.trace && s.trace.kept) || 0) +
        ' · delivered: ' + (s.delivered || 0) +
        ' · this is a delivery notice, not an instruction.'
      const dispose = host.context({ name: REPORT_FEEDBACK_CONTEXT_NAME, order: REPORT_FEEDBACK_CONTEXT_ORDER, text })
      return typeof dispose === 'function' ? dispose : () => {}
    }
    // Wrapped exactly like the prompt-section registration in the entry: the host answers with a Cordis disposer, and an
    // un-wrapped registration would never be collected.
    if (typeof effect === 'function') effect(run, 'vmu:report-feedback')
    else run()
    return Object.assign({}, base, { delivered: true, registered: true, what: REPORT_FEEDBACK_WHAT_CONTEXT })
  } catch (e) {
    const out = named('systemPrompt.context', 'the host refused the feedback context', e)
    complain(out.reason, e)
    return out
  }
}
