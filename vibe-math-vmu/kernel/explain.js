// vmu kernel · explain — making a social action auditable: what a report carries, how long a reason may be, whether a
// reason is demanded at all, how events are correlated, and what format the report takes
// （docs/17 the explain table; docs/11 owns the gate side and docs/03 the code registry）.
//
// WHAT IT IS: a report builder. It does not decide anything about the domain - it decides what an EXPLANATION contains and
// refuses to produce one that would mislead: an action whose reason is required but missing is refused by name, a reason
// longer than the declared cap is refused rather than truncated, and a correlation that cannot be established is reported
// as absent instead of being faked with a placeholder.
//
// FACE CONVENTIONS: literal key reads; receipts carry enforced[] and fired[]; limits refused BY NAME; nothing declared means
// nothing happens; injected clock; read-only surfaces never mutate.
import { mint } from './ids.js'   // ROUND 2 (task-14): ids never restart from 0 (kernel/ids.js)
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const intOr = (v, d) => (Number.isInteger(v) ? v : d)

export const CODE = Object.freeze({
  reasonRequired: 'VMU_EXPLAIN_REASON_REQUIRED',
  reasonTooLong: 'VMU_EXPLAIN_REASON_TOO_LONG',
  correlationUnknown: 'VMU_EXPLAIN_CORRELATION_UNKNOWN',
})

export function createExplain({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createExplain needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    detail: ['summary', 'full'].includes(sget('vmu.explain.detail')) ? sget('vmu.explain.detail') : 'summary',
    includeChains: boolOr(sget('vmu.explain.includeChains'), true),
    includeScores: boolOr(sget('vmu.explain.includeScores'), true),
    reasonRequired: boolOr(sget('vmu.explain.reasonRequired'), true),
    reasonMaxChars: (() => { const v = intOr(sget('vmu.explain.reasonMaxChars', 400), 400); return v >= 1 ? v : 400 })(),
    correlateBy: ['traceId', 'taskId', 'none'].includes(sget('vmu.explain.correlateBy')) ? sget('vmu.explain.correlateBy') : 'traceId',
    reportFormat: sget('vmu.explain.reportFormat') === 'json' ? 'json' : 'md',
  })

  const reports = []
  let dropped = 0

  /**
   * Check the reason an action carries. `reasonRequired` demands one; `reasonMaxChars` refuses an over-long one rather than
   * cutting it, because a truncated reason is a different statement from the one the actor made.
   */
  function checkReason({ reason = null, action = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.explain.reasonRequired', 'vmu.explain.reasonMaxChars']
    const fired = []
    const text = str(reason)
    if (!text) {
      if (c.reasonRequired) {
        fired.push('vmu.explain.reasonRequired')
        throw refuse(CODE.reasonRequired, 'vmu.explain.reasonRequired=true: ' + (action === null ? 'this action' : String(action)) + ' needs a reason',
          'pass reason:<why>, or set the key to false deliberately', { action: action === null ? null : String(action), enforced, fired })
      }
      return { ok: true, reason: null, length: 0, enforced, fired }
    }
    if (text.length > c.reasonMaxChars) {
      fired.push('vmu.explain.reasonMaxChars')
      throw refuse(CODE.reasonTooLong, 'the reason is longer than vmu.explain.reasonMaxChars: ' + text.length + ' > ' + c.reasonMaxChars,
        'shorten it and keep the full text elsewhere; this face will NOT truncate it for you', { length: text.length, cap: c.reasonMaxChars, enforced, fired })
    }
    return { ok: true, reason: text, length: text.length, enforced, fired }
  }

  /** Correlate an event. `correlateBy: none` means the face does NOT correlate, and says so instead of inventing an id. */
  function correlate({ traceId = null, taskId = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.explain.correlateBy']
    if (c.correlateBy === 'none') {
      return { ok: true, by: 'none', value: null, correlated: false, note: 'vmu.explain.correlateBy=none: nothing is correlated, and no id is invented', enforced, fired: ['vmu.explain.correlateBy'] }
    }
    const value = c.correlateBy === 'traceId' ? str(traceId) : str(taskId)
    if (!value) {
      throw refuse(CODE.correlationUnknown, 'vmu.explain.correlateBy=' + c.correlateBy + ' but no ' + c.correlateBy + ' was given',
        'pass the ' + c.correlateBy + ', or set correlateBy=none deliberately', { by: c.correlateBy, enforced, fired: ['vmu.explain.correlateBy'] })
    }
    return { ok: true, by: c.correlateBy, value, correlated: true, enforced, fired: [] }
  }

  /**
   * Build a report. `detail` decides how much survives, `includeChains` / `includeScores` decide which sections exist, and
   * `reportFormat` decides what render() returns. Every omission is NAMED in the receipt - a report never quietly loses a
   * section, because a reader cannot tell an absent section from one that was never there.
   */
  function build({ action = null, reason = null, traceId = null, taskId = null, chains = null, scores = null, fields = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.explain.detail', 'vmu.explain.includeChains', 'vmu.explain.includeScores', 'vmu.explain.reasonRequired', 'vmu.explain.reasonMaxChars', 'vmu.explain.correlateBy', 'vmu.explain.reportFormat']
    const fired = []
    const checked = checkReason({ reason, action })
    fired.push(...checked.fired)
    const corr = correlate({ traceId, taskId })
    fired.push(...corr.fired)
    const omitted = []
    let chainList = null
    if (c.includeChains) chainList = Array.isArray(chains) ? chains.map((x) => Object.assign({}, x)) : []
    else omitted.push('chains')
    let scoreList = null
    if (c.includeScores) scoreList = Array.isArray(scores) ? scores.map((x) => Object.assign({}, x)) : []
    else omitted.push('scores')
    const base = Object.assign({}, fields && typeof fields === 'object' ? fields : {})
    if (c.detail === 'summary') { for (const k of Object.keys(base)) { if (String(base[k]).length > 200) { base[k] = String(base[k]).slice(0, 200) + '…'; omitted.push('long-field:' + k) } } }
    const report = {
      id: mint('explain', 'explain-'), action: action === null ? null : String(action), reason: checked.reason,
      correlation: { by: corr.by, value: corr.value, correlated: corr.correlated },
      chains: chainList, scores: scoreList, fields: base,
      detail: c.detail, format: c.reportFormat, omitted: omitted.slice(), at: clock(),
    }
    reports.push(report)
    while (reports.length > 200) { reports.shift(); dropped += 1 }
    say({ type: 'explain/built', at: report.at, id: report.id, action: report.action, format: c.reportFormat, omitted: report.omitted.length })
    return { ok: true, report: Object.assign({}, report), enforced: [...new Set(enforced)], fired: [...new Set(fired)] }
  }

  /** Render a built report. `reportFormat` is the decision: markdown or JSON, never both at once. */
  function render({ report = null, format = null } = {}) {
    const c = cfg()
    const fmt = format === 'json' || format === 'md' ? format : c.reportFormat
    const r = report || reports[reports.length - 1]
    if (!r) throw refuse('VMU_INVALID_ARGUMENT', 'render needs a report', 'build() one first, or pass { report }')
    const enforced = ['vmu.explain.reportFormat']
    if (fmt === 'json') return { ok: true, format: 'json', text: JSON.stringify(r), enforced, fired: format === null ? [] : ['vmu.explain.reportFormat'] }
    const lines = ['## ' + (r.action || 'explanation'), '', '- id: ' + r.id, '- reason: ' + (r.reason === null ? '(none)' : r.reason),
      '- correlation: ' + (r.correlation.correlated ? r.correlation.by + '=' + r.correlation.value : 'none')]
    if (r.chains !== null) lines.push('- chains: ' + r.chains.length)
    if (r.scores !== null) lines.push('- scores: ' + r.scores.length)
    if (r.omitted.length) lines.push('- omitted: ' + r.omitted.join(', '))
    return { ok: true, format: 'md', text: lines.join('\n'), enforced, fired: format === null ? [] : ['vmu.explain.reportFormat'] }
  }

  /** Read-only. */
  const status = () => ({
    ok: true, reports: reports.length, dropped,
    policy: cfg(),
    omissionsAreNamed: true,
    readsArePure: true,
    items: reports.slice(0, listCap).map((r) => ({ id: r.id, action: r.action, detail: r.detail, omitted: r.omitted.length })),
    at: clock(),
  })

  return { apiVersion, checkReason, correlate, build, render, status }
}
