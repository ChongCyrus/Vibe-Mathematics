// vmu kernel · report — the REPORTING primitive: when a report is due, what it says, who receives it, and the trace it
// leaves. This is the other half of "the main agent is an assistant": an assistant that reports outward needs a
// mechanism that can be DECLARED, and that mechanism must not exist until somebody declares it.
//
// WHAT IT IS (docs/22 §reporting, docs/16 §reporting): the trigger (event / period / threshold), the content template
// (declarable, with a closed variable whitelist), the recipients and the channel, an off switch whose default value
// declares nothing at all, and one append-only trace row per report.
//
// THE TWO INVARIANTS WORTH STATING.
//   1. ZERO MECHANISM: `vmu.report.enabled` defaults false AND `vmu.report.reports` defaults to the empty list, so an
//      unconfigured instance reports exactly nothing. A declared report under a disabled switch is not silently
//      dropped either - `status().problems` names it, because "declared but off" and "never declared" are different
//      facts and a reader is entitled to tell them apart.
//   2. IT NEVER DRIVES. Every receipt carries `drives:false`; the only outbound call this module makes is `deliver`.
//      There is no timer here, no decision service is imported, and a declaration that tries to attach an action
//      (`action` / `then` / `run` / `drive` / `decide` / `execute`) is refused by name rather than quietly disarmed.
//      A report PROMPTS a human or a member; it never substitutes for their decision.
//
// FACE CONVENTIONS (same as the other vmu faces): literal key reads through `settings.get()` on every call (so a hot
// change lands in the same turn, D-13), receipts carry `enforced[]`/`fired[]`, refusals are named, nothing declared
// means nothing happens, the clock is injected, and read-only surfaces never mutate.
//
// ★ AND THIS FILE IMPORTS NOTHING - AN ENFORCED INVARIANT, NOT A STYLE CHOICE. An assertion in the assistant suite fails
// if this file gains even one import, because that is what makes "it cannot reach a decision service even by accident"
// checkable instead of merely stated. So the feedback receipt is INJECTED (see `feedback` below) rather than imported:
// the shape lives in `kernel/reportfeedback.js`, which the assembly site pulls in and hands down.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [])
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const posOr = (v, d) => (Number.isInteger(v) && v > 0 ? v : d)
const finiteOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

export const CODE = Object.freeze({
  noTransport: 'VMU_REPORT_NO_TRANSPORT',
  actionNotAllowed: 'VMU_REPORT_ACTION_NOT_ALLOWED',
  templateVarUnknown: 'VMU_REPORT_TEMPLATE_VAR_UNKNOWN',
  triggerUnknown: 'VMU_REPORT_TRIGGER_UNKNOWN',
  unknownName: 'VMU_REPORT_UNKNOWN_NAME',
  channelUnknown: 'VMU_REPORT_CHANNEL_UNKNOWN',
  noRecipients: 'VMU_REPORT_NO_RECIPIENTS',
  declarationInvalid: 'VMU_REPORT_DECLARATION_INVALID',
  deliverFailed: 'VMU_REPORT_DELIVER_FAILED',
  notEnabled: 'VMU_REPORT_NOT_ENABLED',
  paramNotDeclared: 'VMU_REPORT_PARAM_NOT_DECLARED',
  paramNotAllowed: 'VMU_REPORT_PARAM_NOT_ALLOWED',
  paramReadonly: 'VMU_REPORT_PARAM_READONLY',
  paramReasonRequired: 'VMU_REPORT_PARAM_REASON_REQUIRED',
  auditUnavailable: 'VMU_REPORT_AUDIT_UNAVAILABLE',
})

/** The three trigger kinds a declaration may name. Anything else is refused by name, never guessed at. */
export const TRIGGER_KINDS = Object.freeze(['event', 'period', 'threshold'])

/**
 * The event vocabulary. Closed ON PURPOSE: an event nobody can emit is a promise the framework cannot keep, and an
 * open vocabulary would let a typo switch a report off without a trace (the R4 reasoning for settings keys).
 */
export const EVENT_VOCAB = Object.freeze([
  'progress', 'task-settled', 'meeting-closed', 'ballot-tallied', 'member-stalled', 'turn-end', 'session-start', 'threshold',
])

export const THRESHOLD_OPS = Object.freeze(['gte', 'gt', 'lte', 'lt', 'eq'])

/** Fields that would turn a report into a driver. Their presence is a named refusal, not a silent strip. */
export const DRIVING_FIELDS = Object.freeze(['action', 'then', 'run', 'drive', 'decide', 'execute'])

/** The template variables, exactly. `metric:` and `setting:` take an argument; the rest are bare. */
export const TEMPLATE_VARS = Object.freeze(['at', 'event', 'name', 'count', 'value', 'metric:', 'setting:'])

const DEFAULT_TEMPLATE = '[汇报] {{name}}（{{at}}）'
const ARGS = ['vmu.report.enabled', 'vmu.report.reports', 'vmu.report.channels', 'vmu.report.recipients', 'vmu.report.minIntervalMs',
  'vmu.report.traceCap', 'vmu.report.templateMaxChars', 'vmu.report.params', 'vmu.report.whoMayChange', 'vmu.report.requireReason',
  'vmu.report.auditChanges']

const templateVarKnown = (key) => TEMPLATE_VARS.includes(key) || key.startsWith('metric:') || key.startsWith('setting:')
const templateVarsOf = (text) => {
  const out = []
  const re = /\{\{\s*([a-zA-Z:-]+[a-zA-Z0-9:._-]*)\s*\}\}/g
  let m
  while ((m = re.exec(text)) !== null) out.push(m[1].trim())
  return out
}

/**
 * Create the reporting face. `clock` is required (an injected clock is what makes periods testable); `deliver` is the
 * transport seam; `audit` is where a report row and a parameter change are written; `describeSetting` is the READ-ONLY
 * settings descriptor (`{ key, declared, type, hot, who }`), which is how this face reports the hot class and the
 * declared owner WITHOUT inventing a second source for either.
 */
export function createReport({ clock = () => 0, log = null, settings = {}, deliver = null, audit = null, describeSetting = null, feedback = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createReport needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => {
    if (typeof log === 'function') { try { log(ev) } catch (e) { /* logging never breaks the face */ } return }
    if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* ditto */ } }
  }

  const cfg = () => ({
    enabled: sget('vmu.report.enabled') === true,
    reports: (() => { const v = sget('vmu.report.reports'); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [] })(),
    channels: (() => { const v = listOf(sget('vmu.report.channels')); return v.length ? v : ['inbox', 'digest', 'log'] })(),
    recipients: listOf(sget('vmu.report.recipients')),
    // ★ A1 STEP 1 · PART A (phase 2): the two feedback-loop keys. ★ THESE TWO LINES ARE THE READ ITSELF - the
    // `LIVE_READERS` entry for this key prefix only declares WHO reads at call time; what makes it true is that the
    // read happens here, on every call, exactly like every other key in this face.
    feedback: sget('vmu.report.feedback') === true,
    audience: (() => { const v = sget('vmu.report.audience'); return typeof v === 'string' ? v : '' })(),
    minIntervalMs: intOr(sget('vmu.report.minIntervalMs'), 60000),
    traceCap: posOr(sget('vmu.report.traceCap'), 64),
    templateMaxChars: posOr(sget('vmu.report.templateMaxChars'), 4000),
    params: listOf(sget('vmu.report.params')),
    whoMayChange: (() => { const v = listOf(sget('vmu.report.whoMayChange')); return v.length ? v : ['office'] })(),
    requireReason: sget('vmu.report.requireReason') === true,
    auditChanges: sget('vmu.report.auditChanges') !== false,
  })

  /**
   * THE FEEDBACK RECEIPT (A1 step 1, Part A). The nine keys are ALWAYS present and state is carried by VALUE, never by
   * the presence of a key - a conditional key is itself a shape change, and this file has already learned that once.
   *
   * ★ THE `reason` BELOW IS A TRUE STATEMENT, NOT A STAND-IN FOR "UNSUPPORTED". The delivery call
   * (`systemPrompt.context()`) IS WIRED in this build as of A1 step 1 Part B (a real-machine run returned `delivered:true`); what this bare fallback lacks is the PROVIDER, not the capability. Writing "the host does not expose
   * systemPrompt.context()" would be FALSE - that API was read out of the host's own source and independently
   * verified. So the placeholder names what is actually missing, which is the wiring on OUR side and nothing else.
   *
   * `source` degrades to what this position can HONESTLY support: NOTHING here knows who armed the switch, so an armed
   * switch claims NO layer (null) and a disabled one reports `default` - the layer that is in force when nobody named
   * one. The assembly site supplies the real layer through the provider; naming a layer we cannot attribute would be
   * the misnaming the kernel's own resolved view refuses to make.
   */
  const feedbackReceipt = (c) => {
    if (typeof feedback === 'function') {
      // The provider receives the values THIS face already read, so the settings are read exactly once and the provider
      // cannot invent a second source for them.
      try { return feedback(c) } catch (e) { /* a broken provider must never kill the face */ }
    }
    // THE FALLBACK LOOKS LIKE THE CONTRACT ON PURPOSE, AND IT IS THE ONLY SECOND PLACE THE SHAPE APPEARS. The real
    // shape lives in `kernel/reportfeedback.js`; this file cannot import it (the no-import invariant above), so a BARE
    // construction - no provider supplied, as when a unit test builds this face directly - still returns the same nine
    // keys with state carried by VALUE, which is what keeps the two states the same shape. Every ASSEMBLED instance
    // passes a provider (see `kernel/index.js`), so this path is never taken in a running kernel. It is written here so
    // that omitting the provider cannot silently change what a receipt looks like - NOT as the beginning of a second
    // shape. If the contract ever changes, change `kernel/reportfeedback.js` and then mirror it here.
    return Object.freeze({
      enabled: c.feedback === true,
      // ★ NO LAYER IS CLAIMED FOR AN ARMED SWITCH, for the same reason as the assembly-site placeholder: nothing in this
      // position knows who armed it, and a guessed layer would be worse than none. Off reports the default layer, which
      // is what is in force when no layer was named.
      source: c.feedback === true ? null : 'default',
      audience: c.audience || null,
      delivered: false,
      registered: false,
      code: 'VMU_EXTERNAL_UNAVAILABLE',
      what: 'systemPrompt.context',
      reason: 'this bare construction was given no delivery provider (A1 step 1 Part B wires one at the assembly site): the settings keys are read and reported, the systemPrompt.context() call lands in Part B',
      stack: null,
    })
  }

  /**
   * READING THE CLOCK IS LAZY, AND IT CANNOT KILL THE SURFACE. Two measured facts drove this shape:
   *   · the kernel's clock is the CLOCK-GUARDED one, which THROWS when the underlying clock does not return a finite
   *     number - and a host may inject an ISO-string clock. Calling it at CONSTRUCTION made every such kernel die inside
   *     `createKernel`, i.e. a reporting face that no declaration had even switched on could take the whole preset down
   *     (reported by vmu-pack against tests/vmu-entry.test.mjs, whose clock is a string);
   *   · `status()` and `tick()` are DIAGNOSTIC surfaces: their job is to REPORT a broken clock, not to die of it.
   * So the clock is read only where a time is actually needed, and an unusable one becomes a NAMED condition carried on
   * the receipts (`clock.ok:false`), never a throw. Nothing is guessed: a period trigger simply cannot be evaluated.
   */
  let clockProblem = null
  const readClock = () => {
    try {
      const v = clock()
      if (typeof v === 'number' && Number.isFinite(v)) return v
      clockProblem = 'the injected clock did not return a finite number, so a time-based trigger cannot be evaluated'
      return null
    } catch (e) {
      clockProblem = 'the injected clock refused a reading (' + String((e && e.code) || (e && e.message) || e) + '), so a time-based trigger cannot be evaluated'
      return null
    }
  }
  /** A moment to work with: an explicit `at` wins; otherwise the clock, or null with a NAMED reason on `clockProblem`. */
  const momentOf = (at) => (Number.isFinite(at) ? Number(at) : readClock())

  const traceRows = []
  const paramRows = []
  const lastFired = new Map()     // report name -> ms of its last emission
  // THE PERIOD BASELINE IS ARMED BY THE FIRST EVALUATION, not by construction: construction must not need a clock at all
  // (see readClock above), and "when did this mechanism start being driven" is a fact the first tick actually knows.
  let periodBase = null
  const counters = { fires: 0, delivered: 0, failures: 0, truncated: 0, skipped: 0, dropped: 0, paramChanges: 0 }
  let seq = 0
  let lastAt = null

  /**
   * Normalise ONE declaration. Every problem is collected rather than thrown on the first one, because a deployment
   * reading `declarations()` needs the WHOLE list of what is wrong with it - and a declaration with any problem is
   * never armed, so a broken report cannot fire by accident.
   */
  function normalize(raw, index) {
    const c = cfg()
    const problems = []
    const push = (code, message, hint) => problems.push({ name: str(raw && raw.name) || ('#' + index), code, message, hint: hint || null })
    const name = str(raw && raw.name)
    if (!name) push(CODE.declarationInvalid, 'report #' + index + ' has no name', 'give the declaration a stable name')
    for (const f of DRIVING_FIELDS) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, f)) {
        push(CODE.actionNotAllowed, 'report ' + (name || '#' + index) + ' declares "' + f + '": a report may not drive anything',
          'reports prompt a reader; the action belongs to whoever reads the report, never to the reporter')
      }
    }
    const trigger = raw && raw.trigger && typeof raw.trigger === 'object' ? raw.trigger : {}
    const kind = str(trigger.kind)
    if (!TRIGGER_KINDS.includes(kind)) {
      push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' names an unknown trigger kind: ' + (kind || '(none)'),
        'one of ' + TRIGGER_KINDS.join(', '))
    }
    const event = str(trigger.event)
    if (kind === 'event' && !EVENT_VOCAB.includes(event)) {
      push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' names an unknown event: ' + (event || '(none)'),
        'the vocabulary is closed on purpose: ' + EVENT_VOCAB.join(', '))
    }
    let everyMs = null
    if (kind === 'period') {
      everyMs = posOr(trigger.everyMs, null)
      if (everyMs === null) push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' is a period trigger without everyMs',
        'pass trigger.everyMs in milliseconds')
      else if (c.minIntervalMs > 0 && everyMs < c.minIntervalMs) {
        everyMs = c.minIntervalMs
        problems.push({ name: name || '#' + index, code: 'clamped', message: 'everyMs was raised to vmu.report.minIntervalMs=' + c.minIntervalMs, hint: 'the clamp is reported rather than applied silently' })
      }
    }
    const metric = str(trigger.metric)
    const op = str(trigger.op)
    const value = finiteOr(trigger.value, null)
    if (kind === 'threshold') {
      if (!metric) push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' is a threshold trigger without a metric', 'pass trigger.metric')
      if (!THRESHOLD_OPS.includes(op)) push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' names an unknown threshold op: ' + (op || '(none)'), 'one of ' + THRESHOLD_OPS.join(', '))
      if (value === null) push(CODE.triggerUnknown, 'report ' + (name || '#' + index) + ' is a threshold trigger without a numeric value', 'pass trigger.value')
    }
    const template = typeof raw.template === 'string' && raw.template.trim() ? raw.template : null
    if (template) {
      for (const key of templateVarsOf(template)) {
        if (!templateVarKnown(key)) {
          push(CODE.templateVarUnknown, 'report ' + (name || '#' + index) + ' uses an unregistered template variable: {{ ' + key + ' }}',
            'the whitelist is ' + TEMPLATE_VARS.join(', '))
        }
      }
    }
    const channel = str(raw.channel) || 'log'
    if (!c.channels.includes(channel)) {
      push(CODE.channelUnknown, 'report ' + (name || '#' + index) + ' names a channel outside vmu.report.channels: ' + channel,
        'declared channels: ' + c.channels.join(', '))
    }
    const to = listOf(raw.to)
    if (to.length === 0 && channel !== 'log') {
      push(CODE.noRecipients, 'report ' + (name || '#' + index) + ' has no recipients on a delivery channel',
        'name them in `to`, or use channel "log" for a report that is only recorded')
    }
    if (c.recipients.length > 0) {
      const stray = to.filter((x) => !c.recipients.includes(x))
      if (stray.length > 0) {
        push(CODE.channelUnknown, 'report ' + (name || '#' + index) + ' addresses recipients outside vmu.report.recipients: ' + stray.join(', '),
          'declared recipients: ' + c.recipients.join(', '))
      }
    }
    return { name, index, enabled: raw.enabled !== false, kind, event: event || null, everyMs, metric: metric || null, op: op || null, value,
      template, to, channel, problems: problems.filter((p) => p.code !== 'clamped'), notes: problems.filter((p) => p.code === 'clamped') }
  }

  const declarations = () => {
    const c = cfg()
    const items = c.reports.map((raw, i) => normalize(raw, i))
    const problems = items.flatMap((it) => it.problems.map((p) => Object.assign({}, p)))
    if (!c.enabled && items.length > 0) {
      problems.push({ name: '(all)', code: CODE.notEnabled,
        message: items.length + ' report(s) are declared but vmu.report.enabled=false, so nothing is reported',
        hint: 'set vmu.report.enabled=true to arm them (the off switch is reported, never silent)' })
    }
    return { ok: true, enabled: c.enabled, items, problems, declared: items.length, drives: false,
      note: items.length === 0
        ? 'no reports are declared: nothing is reported (zero mechanism)'
        : (c.enabled ? 'declared reports are armed and evaluated by tick()' : 'reports are declared but the switch is off') }
  }

  const reportNamed = (name) => {
    const d = declarations()
    const it = d.items.find((x) => x.name === str(name)) || null
    if (!it) throw refuse(CODE.unknownName, 'no report is declared under the name: ' + String(name), 'declarations() lists every declared name and every problem')
    if (it.problems.length > 0) {
      throw refuse(it.problems[0].code, 'report ' + it.name + ' cannot run: ' + it.problems[0].message, it.problems[0].hint || null, { problems: it.problems.slice() })
    }
    return it
  }

  /** Render a template. An unfilled variable is refused BY NAME - an empty slot in a report silently becomes a lie. */
  function render(template, vars) {
    const tpl = typeof template === 'string' && template.trim() ? template : DEFAULT_TEMPLATE
    return tpl.replace(/\{\{\s*([a-zA-Z:-]+[a-zA-Z0-9:._-]*)\s*\}\}/g, (whole, rawKey) => {
      const key = rawKey.trim()
      let v
      if (key.startsWith('setting:')) v = sget(key.slice(8))
      else if (key.startsWith('metric:')) v = vars.metrics ? vars.metrics[key.slice(7)] : undefined
      else v = vars[key]
      if (v === undefined || v === null) {
        throw refuse(CODE.templateVarUnknown, 'no value was supplied for ' + whole + ', so the report would have said an empty slot',
          'supply it in the tick context (metrics for metric:, settings for setting:) or drop the placeholder')
      }
      return String(v)
    })
  }

  function truncate(text, cap) {
    if (!Number.isInteger(cap) || cap <= 0 || text.length <= cap) return { text, truncated: 0 }
    const dropped = text.length - cap
    return { text: '（已截断：省略尾部 ' + dropped + ' 字符）\n' + text.slice(0, cap), truncated: dropped }
  }

  function record(row) {
    const c = cfg()
    traceRows.push(row)
    while (traceRows.length > c.traceCap) { traceRows.shift(); counters.dropped += 1 }
    return row
  }

  function auditRow(fields) {
    const c = cfg()
    if (!c.auditChanges) return { appended: false, code: null, note: 'vmu.report.auditChanges=false: this row is deliberately not written to the audit' }
    if (!audit || typeof audit.append !== 'function') {
      return { appended: false, code: CODE.auditUnavailable, note: 'no audit seam was injected: the fact is in this trace and nowhere durable (a named gap, not a silent one)' }
    }
    try { audit.append(fields); return { appended: true, code: null, note: null } }
    catch (e) { return { appended: false, code: (e && e.code) || CODE.auditUnavailable, note: String((e && e.message) || e) } }
  }

  /**
   * Fire ONE normalised declaration. THE ONLY OUTBOUND CALL IN THIS MODULE IS `deliver`. Delivery failure is recorded
   * and counted; it never throws out of `tick()` (a report must not be able to break the turn that produced it).
   */
  function fire(it, { at, event, metrics, payload }) {
    const c = cfg()
    const vars = { at, event: event || it.event || it.kind, name: it.name, count: counters.fires + 1,
      value: it.kind === 'threshold' && metrics ? metrics[it.metric] : (payload && payload.value !== undefined ? payload.value : null),
      metrics }
    const text0 = render(it.template, vars)
    const { text, truncated } = truncate(text0, c.templateMaxChars)
    if (truncated > 0) counters.truncated += 1
    const rec = { id: 'rep-' + (++seq), name: it.name, trigger: it.kind, event: event || it.event || null, at, channel: it.channel,
      to: it.to.slice(), text, truncated, delivered: false, drives: false, error: null, refused: null }
    if (typeof deliver !== 'function') {
      // ★ run-8 finding F: the refusal receipt used to carry only code/message/hint, so a reader of the REFUSAL could
      // not see the two facts that matter (this channel never drives the loop, and no transport is injected) — they
      // were only on status()/declarations(). A refusal is a read face too.
      rec.refused = { code: CODE.noTransport, message: 'no delivery transport was injected: nothing was sent (and nothing is pretended)',
        hint: 'pass { deliver: (report) => … } when creating the module',
        // ★ LIVE RUN 20 (readability residual 2): the brief's own wording is「抄 delivered / drives / code / message」,
        // and this refusal was the ONE place that answered three of the four. `delivered:false` is not decoration — it
        // is the key a reader was told to look for, and "absent" reads as "not measured" where the truth is "no".
        delivered: false, drives: false, neverDrives: true, transportInjected: false }
      say({ type: 'report/undelivered', at, name: it.name, code: CODE.noTransport })
      record(rec)
      return rec
    }
    try {
      deliver({ id: rec.id, name: it.name, trigger: it.kind, at, to: rec.to, channel: it.channel, text, drives: false, payload: payload || null })
      rec.delivered = true
      counters.delivered += 1
    } catch (e) {
      rec.error = { code: (e && e.code) || CODE.deliverFailed, message: String((e && e.message) || e) }
      counters.failures += 1
      say({ type: 'report/delivery-failed', at, name: it.name, code: rec.error.code })
    }
    record(rec)
    return rec
  }

  const thresholdMet = (it, metrics) => {
    if (!metrics || typeof metrics !== 'object') return false
    const got = metrics[it.metric]
    if (typeof got !== 'number' || !Number.isFinite(got)) return false
    if (it.op === 'gte') return got >= it.value
    if (it.op === 'gt') return got > it.value
    if (it.op === 'lte') return got <= it.value
    if (it.op === 'lt') return got < it.value
    return got === it.value
  }

  /**
   * THE SINGLE EVALUATOR. `tick({ at, event, metrics, payload })` decides which declared reports are due: an event
   * trigger whose event matches, a period trigger whose interval has elapsed on the injected clock, a threshold trigger
   * whose metric crosses its line. Unknown events are reported as `ignored` rather than being folded into a near miss.
   */
  function tick({ at = null, event = null, metrics = null, payload = null } = {}) {
    const c = cfg()
    const now = momentOf(at)
    const clockReceipt = { ok: now !== null, at: now, note: now === null ? clockProblem : null }
    const d = declarations()
    if (!c.enabled) {
      return { ok: true, enabled: false, at: now, clock: clockReceipt, declared: d.declared, fired: [], skipped: [], ignored: [],
        delivered: 0, failures: 0, drives: false,
        note: d.declared > 0
          ? 'vmu.report.enabled=false: ' + d.declared + ' declared report(s) were NOT evaluated (this is the off switch, and it is not silent)'
          : 'no reports are declared: nothing is reported (zero mechanism)' }
    }
    const asked = str(event)
    const ignored = asked && !EVENT_VOCAB.includes(asked) ? [{ event: asked, code: CODE.triggerUnknown }] : []
    const fired = []
    const skipped = []
    const dueNow = new Set()
    if (now !== null && periodBase === null) periodBase = now   // ARM THE PERIODS: the first evaluation the mechanism sees
    for (const it of d.items) {
      if (it.problems.length > 0) { counters.skipped += 1; skipped.push({ name: it.name, code: it.problems[0].code }); continue }
      if (it.enabled === false) { continue }
      let due = false
      if (it.kind === 'event') due = asked !== '' && asked === it.event
      else if (it.kind === 'period') due = now !== null && (now - (lastFired.has(it.name) ? lastFired.get(it.name) : periodBase)) >= it.everyMs
      else if (it.kind === 'threshold') due = thresholdMet(it, metrics)
      if (!due) continue
      if (dueNow.has(it.name)) continue
      dueNow.add(it.name)
      lastFired.set(it.name, now)
      const rec = fire(it, { at: now, event: asked || null, metrics, payload })
      counters.fires += 1
      lastAt = now
      fired.push({ name: rec.name, trigger: rec.trigger, at: rec.at, to: rec.to, channel: rec.channel, text: rec.text, truncated: rec.truncated,
        delivered: rec.delivered, drives: false, error: rec.error, refused: rec.refused })
    }
    if (fired.length > 0) {
      const audit = auditRow({ what: 'create', subject: 'report:' + fired.map((f) => f.name).join(','), trigger: fired[0].trigger, at: now,
        to: fired.flatMap((f) => f.to), channel: fired[0].channel, drove: false, count: fired.length })
      say({ type: 'report/tick', at: now, fired: fired.length, delivered: fired.filter((f) => f.delivered).length })
      return { ok: true, enabled: true, at: now, clock: clockReceipt, declared: d.declared, fired, skipped, ignored,
        delivered: fired.filter((f) => f.delivered).length, failures: fired.filter((f) => f.error).length,
        truncated: fired.filter((f) => f.truncated > 0).length, audit, drives: false,
        enforced: ARGS.slice(), fired_keys: ['vmu.report.enabled', 'vmu.report.reports'] }
    }
    return { ok: true, enabled: true, at: now, clock: clockReceipt, declared: d.declared, fired: [], skipped, ignored, delivered: 0, failures: 0,
      drives: false, enforced: ARGS.slice(), fired_keys: [] }
  }

  /** Fire one declared report on purpose. An explicit request gets a loud failure when it cannot be delivered. */
  function emit({ name = null, payload = null, at = null } = {}) {
    const it = reportNamed(name)
    const c = cfg()
    // THE OFF SWITCH MEANS OFF. An explicit emit is still a report, so a disabled switch (or a declaration that
    // switched itself off) refuses by name instead of quietly sending - "off" that still sends is not an off switch.
    if (!c.enabled) {
      throw refuse(CODE.notEnabled, 'vmu.report.enabled=false: report ' + it.name + ' is declared but reporting is switched off',
        'set vmu.report.enabled=true to arm it; declarations() reports the off state rather than hiding it')
    }
    if (it.enabled === false) {
      throw refuse(CODE.notEnabled, 'report ' + it.name + ' is switched off in its own declaration (enabled:false)',
        'drop the declaration, or set enabled:true')
    }
    const now = momentOf(at)
    if (now === null) {
      throw refuse('VMU_INVALID_ARGUMENT', 'no usable moment for this report: ' + String(clockProblem),
        'pass an explicit `at` (a finite ms), or fix the injected clock - a report is stamped with a real time or it is not sent')
    }
    lastFired.set(it.name, now)
    lastFired.set(it.name, now)
    const rec = fire(it, { at: now, event: it.kind === 'event' ? it.event : null, metrics: null, payload })
    counters.fires += 1
    lastAt = now
    if (rec.refused) {
      // ★ run-8 finding F: the refusal is a READ FACE too. It used to carry only code/message/hint, so the two facts
      // that matter — this channel never drives the loop, and no transport is injected — were readable on
      // `status()`/`declarations()` but NOT on the receipt of the call that failed. An acceptance check that reads the
      // refusal could not tell "refused" from "sent nothing on purpose".
      const refused = Object.assign({}, rec.refused, {
        // `delivered:false` kept here too (run 20): this object is what the CALLER's receipt carries, and it must answer
        // the same four questions as the record above — otherwise the two read faces differ on the one key a reader was
        // told to quote.
        delivered: false, drives: false, neverDrives: true, transportInjected: typeof deliver === 'function',
        report: it.name, id: rec.id,
      })
      const err = refuse(rec.refused.code, rec.refused.message, rec.refused.hint, { report: it.name, id: rec.id })
      for (const k of Object.keys(refused)) if (err[k] === undefined) err[k] = refused[k]
      throw err
    }
    return { ok: true, report: rec.name, id: rec.id, trigger: rec.trigger, at: rec.at, to: rec.to, channel: rec.channel, text: rec.text,
      truncated: rec.truncated, delivered: rec.delivered, drives: false, enforced: ARGS.slice(), fired: ['vmu.report.reports'] }
  }

  /** Render a declared report WITHOUT sending it - the "show me what would go out" surface. */
  function preview({ name = null, payload = null, at = null } = {}) {
    const it = reportNamed(name)
    const now = momentOf(at)
    const vars = { at: now, event: it.kind === 'event' ? it.event : it.kind, name: it.name, count: counters.fires + 1,
      value: payload && payload.value !== undefined ? payload.value : null, metrics: payload && payload.metrics ? payload.metrics : null }
    const text0 = render(it.template, vars)
    const { text, truncated } = truncate(text0, cfg().templateMaxChars)
    return { ok: true, name: it.name, trigger: it.kind, channel: it.channel, to: it.to.slice(), text, truncated, delivered: false, drives: false,
      at: now, clock: { ok: now !== null, note: now === null ? clockProblem : null } }
  }

  const trace = ({ limit = 20 } = {}) => {
    const c = cfg()
    const n = Number.isInteger(limit) && limit > 0 ? limit : 20
    const items = traceRows.slice(-n).map((r) => Object.assign({}, r))
    return { ok: true, items, total: traceRows.length, cap: c.traceCap, dropped: counters.dropped, omitted: traceRows.length - items.length, drives: false }
  }

  /**
   * THE PARAMETER DOMAIN. Which keys the main agent may see and change, who may change them, the hot class and the
   * declared owner - ALL of it from declarations (`vmu.report.params`, `vmu.report.whoMayChange`) and from the settings
   * descriptor. The kernel holds no opinion here: aligning with "only the office may change parameters" is a DECLARED
   * alignment, not a hard-coded rule.
   */
  function paramDomain() {
    const c = cfg()
    const haveDescriptor = typeof describeSetting === 'function'
    const entries = c.params.map((key) => {
      const set = sget(key)
      const desc = haveDescriptor ? (describeSetting(key) || null) : null
      return {
        key,
        value: set === undefined ? null : set,
        declared: desc ? desc.declared !== false : (haveDescriptor ? false : null),
        type: desc && desc.type ? String(desc.type) : null,
        hot: desc && desc.hot ? String(desc.hot) : null,
        who: desc && desc.who ? String(desc.who) : null,
      }
    })
    return {
      ok: true,
      paramsDeclared: c.params.length > 0,
      declared: c.params.length,
      whoMayChange: c.whoMayChange.slice(),
      requireReason: c.requireReason,
      hotClasses: entries.map((e) => e.hot).filter((x) => x !== null),
      entries,
      described: haveDescriptor,
      drives: false,
      note: c.params.length === 0
        ? 'no parameter domain is declared (vmu.report.params is empty): changing any key is refused by name rather than guessed at'
        : (haveDescriptor
          ? 'each key carries the hot class and declared owner from the settings descriptor'
          : 'this assembly has no settings descriptor, so hot and who are reported as null (UNKNOWN) rather than invented'),
    }
  }

  /**
   * Record a parameter change. THIS MODULE DOES NOT WRITE SETTINGS: the sanctioned writer is the kernel's own
   * setSettingsValue(), whose guard owns the H3 and declared-owner refusal. What this adds is the LEDGER: one trace row
   * and one audit row (`what:'update'`), so a change leaves a trace instead of disappearing.
   */
  function noteParamChange({ key = null, from = null, to = null, by = null, reason = null, hot = null } = {}) {
    const c = cfg()
    const k = str(key)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'noteParamChange needs the setting key it describes', 'pass { key }')
    const row = { id: 'rep-param-' + (++seq), at: momentOf(null), key: k, from: from === undefined ? null : from, to: to === undefined ? null : to,
      by: by === null ? null : String(by), reason: str(reason) || null, hot: hot === null ? null : String(hot), drives: false }
    paramRows.push(row)
    while (paramRows.length > c.traceCap) paramRows.shift()
    counters.paramChanges += 1
    say({ type: 'report/param-change', at: row.at, key: k, by: row.by })
    const audit = auditRow({ what: 'update', subject: 'setting:' + k, by: row.by, from: row.from, to: row.to, reason: row.reason, hot: row.hot })
    return { ok: true, recorded: true, change: Object.assign({}, row), audit, drives: false,
      enforced: ['vmu.report.auditChanges', 'vmu.report.whoMayChange'], fired: [] }
  }

  /** Refusals the TOOL face must raise before calling the kernel writer. Exposed so there is ONE implementation. */
  function guardParam({ key, by = null, reason = null } = {}) {
    const c = cfg()
    const k = str(key)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'a parameter change needs a key', 'pass { key }')
    if (!c.params.includes(k)) {
      throw refuse(CODE.paramNotDeclared, 'this key is outside the declared parameter domain: ' + k,
        'vmu.report.params declares what the main agent may view or change' + (c.params.length ? '; declared: ' + c.params.join(', ') : ' (it is empty, so nothing is changeable)'),
        { key: k, declared: c.params.slice() })
    }
    if (by !== null && by !== undefined && !c.whoMayChange.includes(String(by))) {
      throw refuse(CODE.paramNotAllowed, String(by) + ' may not change ' + k + ' (declared owners: ' + c.whoMayChange.join(', ') + ')',
        'vmu.report.whoMayChange names who may change the domain; the framework hard-codes no owner')
    }
    if (c.requireReason && !str(reason)) {
      throw refuse(CODE.paramReasonRequired, 'vmu.report.requireReason=true: a parameter change needs a reason',
        'pass reason, so the audit row explains why the knob moved')
    }
    return { ok: true, key: k, by: by === null || by === undefined ? null : String(by), hot: null, who: null }
  }

  const status = () => {
    const c = cfg()
    const d = declarations()
    const at = momentOf(null)
    const armed = d.items.filter((it) => it.problems.length === 0 && it.enabled !== false).length
    const problems = d.problems.map((p) => ({ name: p.name, code: p.code, message: p.message }))
    // A clock nobody can read is a NAMED problem, not a silent null: every time-based trigger is unevaluable until it
    // is fixed, and the reader is told which surface is degraded and why.
    if (clockProblem !== null) problems.push({ name: '(clock)', code: 'VMU_INVALID_ARGUMENT', message: clockProblem })
    return {
      ok: true,
      enabled: c.enabled,
      declared: d.declared,
      armed,
      problems,
      // Clamps and other "the declaration was changed to something legal" facts. Reported rather than applied in
      // silence: a period silently shortened or lengthened would be a knob the operator never set.
      notes: d.items.flatMap((it) => it.notes.map((n) => ({ name: it.name, code: n.code, message: n.message }))),
      fires: counters.fires,
      skipped: counters.skipped,
      lastAt,
      delivered: counters.delivered,
      failures: counters.failures,
      truncated: counters.truncated,
      drives: false,
      neverDrives: true,
      // ★ A1 STEP 1 · PART A (phase 2): the feedback loop's receipt. Nine keys, ALWAYS present, state by VALUE. Until
      // Part B wires the delivery call, this names that fact in `reason` - truthfully, on our side, not as a claim that
      // the host lacks the ability.
      reportFeedback: feedbackReceipt(c),
      transportInjected: typeof deliver === 'function',
      auditInjected: !!(audit && typeof audit.append === 'function'),
      descriptorInjected: typeof describeSetting === 'function',
      trace: { kept: traceRows.length, cap: c.traceCap, dropped: counters.dropped },
      params: { declared: c.params.length, whoMayChange: c.whoMayChange.slice(), requireReason: c.requireReason, changes: counters.paramChanges },
      channels: c.channels.slice(),
      policy: { enabled: c.enabled, reports: c.reports.length, minIntervalMs: c.minIntervalMs, templateMaxChars: c.templateMaxChars,
        recipients: c.recipients.slice(), auditChanges: c.auditChanges },
      enforced: ARGS.slice(),
      note: d.note,
      // A DIAGNOSTIC SURFACE REPORTS A BROKEN CLOCK, IT DOES NOT DIE OF ONE. Nothing is read at construction (a host
      // may inject a string or a guarded clock), and an unusable reading lands here as a named fact.
      at,
      clock: { ok: clockProblem === null, note: clockProblem },
      periodBaseArmed: periodBase !== null,
    }
  }

  return { apiVersion, declarations, status, tick, emit, preview, trace, paramDomain, guardParam, noteParamChange }
}
