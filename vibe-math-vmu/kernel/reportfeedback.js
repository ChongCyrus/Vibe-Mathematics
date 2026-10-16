// vmu kernel · reportfeedback — THE SHAPE AND BOUNDS OF ONE REPORT-FEEDBACK RECEIPT (round 8, phase 2, A1 step 1).
//
// WHY THIS FILE EXISTS. Reporting today is recorded and nothing comes back: the report face's default channel is
// `log` ("recorded only", `kernel/report.js:211`) and its default recipients are empty (`:111`), so a report has no
// audience and no path back to the model. Three behavioural rounds measured it: six sessions, ZERO spontaneous
// reports, while 6/6 of the outputs contained something worth reporting. The missing piece is the LOOP, not the
// capability.
//
// WHAT IT OWNS. The pure part of that loop: the named bounds, the caller-side order validation the HOST does not do,
// the constant 9-key receipt shape, and the bounded text that would be delivered.
//   · `REPORT_FEEDBACK_MAX_BYTES` — ★ HOST PRECEDENT, NOT OUR INVENTION: `@deepseek-ai/dsh-session-reference`
//     (`lib/index.js:98`) caps a model-visible text at `DEFAULT_MAX_REFERENCE_BYTES = 65536`, and scales it with the
//     model's context window (`:664-665`). The host's `dsh-system-prompt` service does NOT cap dynamic context (its
//     only length filters are `.filter(text => text.length > 0)` at `:114`/`:150`), so ★ THE BOUND IS OURS TO SET and
//     the host does not enforce it for us.
//   · `REPORT_FEEDBACK_CONTEXT_ORDER` — ★ AN EXPLICIT FINITE NUMBER, NEVER AN INVENTED SLOT NAME: the service's
//     `context({ name, order, text })` (`dsh-system-prompt/lib/index.js:266-268`) takes the ORDER FROM THE CALLER.
//     `getContextOrder('<new name>')` returns `undefined` (`:257-258` over a three-entry `CONTEXT_ORDERS` table), and
//     passing `undefined` as an order sorts on nothing. `CONTEXT_ORDERS` is a convenience table for CENTRALLY owned
//     placements, not an admission list — so we pass our own number and never rely on the map.
//   · `assertFiniteOrder()` — ★ WE VALIDATE BECAUSE THE HOST DOES NOT: `section()` throws on a non-finite order
//     (`:241`), while `context()` carries no such check.
//   · `reportFeedbackReceipt()` — the NINE keys, ALWAYS ALL PRESENT. State is expressed by VALUE (`enabled:false`,
//     `delivered:false`, `code:null`), never by the presence of a key: a conditional key is itself a shape change,
//     and the same file already learned that lesson (`receiptMeta`, round 32/33).
//   · `boundFeedback()` — truncation that SAYS SO, in the house form.
//
// WHAT IT DOES NOT OWN (named, not implied):
//   · it does NOT decide whether feedback is on — the settings keys are read by `kernel/report.js`, and this module
//     must not become a second place where that policy lives;
//   · it does NOT deliver anything; delivery is the `systemPrompt.context()` call, and its failure is REPORTED by the
//     caller in these nine keys rather than swallowed;
//   · it does NOT make the host cap anything: `MAX_BYTES` is ours, and a caller that ignores `boundFeedback()` is not
//     stopped by this module.
//
// ZERO MECHANISM: pure functions and constants — no `create*` factory, no service, nothing to probe, so the matrix
// registers this module as `EXPECT_NA` (the closed-set value for a non-service module).

/** ★ See the header: the number comes from the host's own model-visible-text precedent, not from us. */
export const REPORT_FEEDBACK_MAX_BYTES = 65536

/**
 * ★ The order we pass to `systemPrompt.context({ name, order, text })`. It is an EXPLICIT FINITE NUMBER on purpose:
 * the host's `CONTEXT_ORDERS` map (110/115/120) is for centrally owned placements and returns `undefined` for any
 * name it does not know, and an `undefined` order sorts on nothing. 5000 sits after those three and well before the
 * section slots that carry tool/report material, so feedback lands with the runtime context rather than inside policy.
 */
export const REPORT_FEEDBACK_CONTEXT_ORDER = 5000

/** The context name we register under. Stable, so a composition can replace rather than duplicate it. */
export const REPORT_FEEDBACK_CONTEXT_NAME = 'vmu:report-feedback'

/** Where a failure is attributed when the context call itself is unreachable. */
export const REPORT_FEEDBACK_WHAT_CONTEXT = 'systemPrompt.context'

/** Where a failure is attributed when feedback is on but nobody is named to receive it. */
export const REPORT_FEEDBACK_WHAT_AUDIENCE = 'report.audience'

/** The nine keys, in a fixed order, so two receipts are comparable character by character. */
export const REPORT_FEEDBACK_KEYS = Object.freeze([
  'enabled', 'source', 'audience', 'delivered', 'registered', 'code', 'what', 'reason', 'stack',
])

/**
 * ★ WE VALIDATE BECAUSE THE HOST DOES NOT. `section()` throws on a non-finite order; `context()` does not, so an
 * `undefined` order would travel as far as the insert. Refuse it HERE, by name, with an already-registered code.
 */
export function assertFiniteOrder(order) {
  if (!Number.isFinite(order) || order < 0) {
    throw Object.assign(new Error('report feedback context order must be a finite number >= 0, got ' + String(order)),
      { code: 'VMU_MIDDLEWARE_FAILED' })
  }
  return order
}

/**
 * The constant 9-key receipt. ★ EVERY KEY IS ALWAYS PRESENT: the caller passes what it knows, and everything else
 * falls back to its EMPTY-STATE value (`false` for the two booleans, `null` for the rest) instead of being omitted, so
 * the key set cannot depend on whether anything went wrong.
 */
export function reportFeedbackReceipt(input = {}) {
  return {
    enabled: input.enabled === true,
    // ★ A NON-STRING SOURCE IS `null`, LIKE EVERY OTHER FIELD HERE - NOT `'default'`. Inventing the default layer for a
    // caller that never claimed one is how "the layer is unknown" became a NAMED BUT UNTRUE fact: a bare construction
    // with the switch ARMED was reported as coming from the default layer, which is precisely the misnaming this
    // contract exists to prevent. Callers that DO know the layer name it - `'default'` included - and the kernel's
    // resolved view is the only place that name comes from.
    source: typeof input.source === 'string' ? input.source : null,
    audience: typeof input.audience === 'string' && input.audience.length > 0 ? input.audience : null,
    delivered: input.delivered === true,
    registered: input.registered === true,
    code: typeof input.code === 'string' ? input.code : null,
    what: typeof input.what === 'string' ? input.what : null,
    reason: typeof input.reason === 'string' ? input.reason : null,
    stack: typeof input.stack === 'string' ? input.stack : null,
  }
}

/**
 * ★ The named-failure form, matching the house shape of `promptSection` (which uses `code`/`what`/`reason`/`stack`):
 * a degradation is NAMED and never silent. `VMU_EXTERNAL_UNAVAILABLE` is REUSED, not invented.
 */
export function reportFeedbackFailure({ enabled, source, audience, what, reason, error }) {
  return reportFeedbackReceipt({
    enabled, source, audience,
    delivered: false, registered: false,
    code: 'VMU_EXTERNAL_UNAVAILABLE',
    what,
    reason,
    stack: error && typeof error.stack === 'string' ? error.stack : null,
  })
}

/**
 * Bound the text we would deliver, and SAY what was dropped. The host does not bound dynamic context, so this is the
 * only bound there is; the return value carries the elision so a reader is never told a shortened text is whole.
 */
export function boundFeedback(text, max = REPORT_FEEDBACK_MAX_BYTES) {
  const s = typeof text === 'string' ? text : String(text === undefined || text === null ? '' : text)
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : REPORT_FEEDBACK_MAX_BYTES
  if (s.length <= limit) return { text: s, truncated: false, elidedBytes: 0, originalBytes: s.length, maxBytes: limit }
  return { text: s.slice(0, limit), truncated: true, elidedBytes: s.length - limit, originalBytes: s.length, maxBytes: limit }
}
