// vmu kernel · alerts — the OPS judgement surface: thresholds, alert-level dedup, inhibition, silence
// windows with a MANDATORY catch-up summary, escalation, SLO error budget, and the runbook lookup
// (docs/21-observability-and-operations.md).
//
// Design source: docs/21
//   §5.3 告警面: threshold (metric+window+comparison) · inhibition (a superior fault suppresses inferiors)
//        · dedup (SAME FINGERPRINT once per window) · escalation (unacknowledged for N ms ⇒ next layer)
//        · silence windows (maintenance: SILENT BUT NOT DROPPED — a summary MUST follow) · channels (17 卷)
//   §13  SLO 与错误预算: SLI/SLO/error budget/punishment/exemption/report, with "SLO 不得自证" and
//        "预算耗尽 ⇒ 冻结非必要变更（H2）；H0/H1 救火除外且必须留痕"
//   §14  Runbook R1–R10: fingerprint → judgement (codes) → ordered actions → acceptance
//   §5.3/§17 LAYERING (hard): the ALERT fingerprint is `metric × object × code`; volume 17's NOTIFICATION
//        fingerprint is `watcher × event × object`. They are DELIBERATELY different and must not be mixed —
//        an alert keyed on the notification fingerprint would collapse distinct alerts (and vice versa).
//
// Invariants (the same set the rest of the kernel keeps — see kernel/metrics.js):
//   · every refusal is NAMED (VMU_* + hint) and COUNTED BY CODE before it is thrown — never a bare exception
//   · every upper bound reports how many items were DROPPED (thresholds/fingerprints/silences/exemptions/samples)
//   · SILENCE IS NOT DISCARD: alerts raised inside a silence window are COUNTED, attributed to the window, and
//     a catch-up summary is produced when the window ends (and must be flushed to be marked delivered)
//   · DEDUP IS NOT DISCARD: a deduplicated re-fire still increments the alert's own count
//   · a threshold/SLO with NO SAMPLES is `undecided` — never a silent pass (aligned with metrics.kpi())
//   · ZERO MECHANISM: with nothing declared this module is inert, throws nothing, and COUNTS the skips
//   · the only time source is the injected `clock` (never real time, never random ⇒ byte-deterministic)
//   · READ paths (status/summaries/budget/runbook) never mutate RECORDED data
//
// Settings (concrete names are read TOLERANTLY; an absent key uses the documented default):
//   vmu.alerts.thresholds[] | inhibitions[] | dedupWindowMs | escalateAfterMs | silenceWindows[] | channels[]
//   vmu.alerts.autoEscalate | maxSamples | maxThresholds | maxFingerprints | maxSilences | maxExemptions
//   vmu.slo.targets[] | vmu.slo.errorBudgetAction | vmu.slo.exemptions[]
//
// Codes used here (03-§8 registry): VMU_INVALID_ARGUMENT · VMU_NO_SUCH_OBJECT · VMU_CONFLICT ·
//   VMU_RESOURCE_BUDGET · VMU_STATE · VMU_ALERT_SUPPRESSED · VMU_ALERT_SILENCED · VMU_SLO_BUDGET_EXHAUSTED

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** Threshold operators (docs/21 §5.3). `rate>`/`rate<` compare the last sample with the previous one. */
export const OPS = Object.freeze(['>', '>=', '<', '<=', '==', 'rate>', 'rate<'])

/** SLO states (docs/21 §13): three-valued on purpose — `undecided` is NOT a pass. `exempt` is explicit. */
export const SLO_STATES = Object.freeze(['met', 'breached', 'undecided', 'exempt'])

/** The punishment ladder (docs/21 §13). The module REPORTS it; enforcement is `guardChange()`. */
export const ERROR_BUDGET_ACTIONS = Object.freeze(['freeze-H2', 'warn', 'none'])

/** The alert/SLO codes this module can raise. */
export const ALERT_CODES = Object.freeze({
  SUPPRESSED: 'VMU_ALERT_SUPPRESSED',
  SILENCED: 'VMU_ALERT_SILENCED',
  BUDGET_EXHAUSTED: 'VMU_SLO_BUDGET_EXHAUSTED',
})

/** Runbook R1–R10 (docs/21 §14) — fingerprint → judgement codes → ordered actions → acceptance. */
export const RUNBOOK = Object.freeze([
  { id: 'R1', fingerprint: '工具全消失', codes: [], steps: ['查配置', 'set key=vmu.core.enabled value=true', '跑 §5.1 自检'], acceptance: 'vibe_vmu_status 回执 ok:true；§5.1 全项可读（具名判据）' },
  { id: 'R2', fingerprint: '某个中间件"没生效"', codes: ['VMU_MIDDLEWARE_FAILED'], steps: ['看 consecutiveFailures', '查审计 middleware/breaker-tripped', '修条目', 'middleware enable'], acceptance: '条目 disabledReason 为空且 hits 增长（场景判据）' },
  { id: 'R3', fingerprint: '动作被拒但不知为何', codes: ['VMU_MIDDLEWARE_REJECTED', 'VMU_NOT_PERMITTED'], steps: ['按 18-§7 查处置', '取中间件 id', 'middleware dryRun 复现'], acceptance: '同一输入在 dryRun 下稳定给出同一决策（断言级）' },
  { id: 'R4', fingerprint: '提示词变了/少了', codes: ['VMU_BODY_TRUNCATED'], steps: ['比对 snapshot 快照', '看 sources[] 找来源', '若是截断 ⇒ 调预算或改 keepChars'], acceptance: '快照逐字一致或差异可逐段解释（具名段名）' },
  { id: 'R5', fingerprint: '审计/指标不落盘', codes: ['VMU_AUDIT_WRITE_FAILED'], steps: ['进 L2 观测降级（业务继续）', '查路径/权限/磁盘', '修好后补报缺口'], acceptance: '新行可见且缺口摘要已记（具名文件与 errno 面）' },
  { id: 'R6', fingerprint: '耐久写失败', codes: ['VMU_STORE_FAILED', 'VMU_WRITE_FAILED'], steps: ['进 L3 只读降级', '查磁盘/权限', '按 §10 恢复点核验'], acceptance: '写回执 ok:true 且恢复自证通过（场景判据）' },
  { id: 'R7', fingerprint: '脚本超时/起不来', codes: ['VMU_JOB_TIMEOUT', 'VMU_MIDDLEWARE_FAILED'], steps: ['看 stats.timeouts', '查 cwd（必须给真实字符串，规避宿主 validateNoNullByte 缺陷）', '调 timeoutMs', '重跑'], acceptance: '脚本 run 回执 ok:true（场景判据）' },
  { id: 'R8', fingerprint: '预算触顶', codes: ['VMU_RESOURCE_BUDGET'], steps: ['查 budgetRefusals', '定位循环调用', '清积压后再提额'], acceptance: '拒绝率回落且无新增预算拒绝（具名指标）' },
  { id: 'R9', fingerprint: '版本不匹配', codes: ['VMU_VERSION_MISMATCH'], steps: ['对齐 apiVersion/manifest', '重载', '跑 §9 发布门'], acceptance: '装载 ok:true（断言级）' },
  { id: 'R10', fingerprint: '迁移中断', codes: ['VMU_MIGRATE_DRYRUN_FAILED', 'VMU_ROLLBACK_FAILED'], steps: ['停写（L3）', '按 13 回退', 'dry-run 绿后再发'], acceptance: 'dry-run 绿＋数据核验一致（场景判据）' },
])

const DEFAULTS = Object.freeze({
  dedupWindowMs: 300000, escalateAfterMs: 900000,
  maxSamples: 200, maxThresholds: 200, maxFingerprints: 500, maxSilences: 100, maxExemptions: 100,
})

const cmp = (actual, op, target) => (
  op === '>' ? actual > target
    : op === '>=' ? actual >= target
      : op === '<' ? actual < target
        : op === '<=' ? actual <= target
          : actual === target
)

/** The alert fingerprint (docs/21 §5.3, HARD): `metric × object × code`. NEVER the 17-volume notification
 *  fingerprint (`watcher × event × object`) — the two answer different questions and must not be merged. */
export function fingerprintOf({ metric, object = null, code = null }) {
  return String(metric) + '×' + (object === null || object === undefined ? '-' : String(object)) + '×' + (code === null || code === undefined ? '-' : String(code))
}

/**
 * createAlerts — the ops judgement surface.
 * `clock` is the ONLY time source (ms). `metrics` is OPTIONAL: when injected (anything exposing
 * `snapshot({indicators,window})` and/or `kpi({...})`) it is the preferred reading source; without it the
 * module works standalone from `sample()` observations. `log`/`bus` are advisory and never break a call.
 */
export function createAlerts({ clock = () => 0, log = null, settings = {}, bus = null, metrics = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createAlerts needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging never breaks the alert */ } } }
  const emit = (event) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(event) } catch (e) { /* the bus is advisory */ } } }
  const asInt = (v, def) => (Number.isInteger(v) && v > 0 ? v : def)
  const arr = (v) => (Array.isArray(v) ? v.slice() : [])
  const atMs = (at) => (at === null || at === undefined ? clock()
    : (typeof at === 'number' && Number.isFinite(at) ? at
      : (typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : null)))

  const dedupWindowMs = asInt(sget('vmu.alerts.dedupWindowMs', DEFAULTS.dedupWindowMs), DEFAULTS.dedupWindowMs)
  const escalateAfterMs = asInt(sget('vmu.alerts.escalateAfterMs', DEFAULTS.escalateAfterMs), DEFAULTS.escalateAfterMs)
  const autoEscalate = sget('vmu.alerts.autoEscalate', false) === true
  const maxSamples = asInt(sget('vmu.alerts.maxSamples', DEFAULTS.maxSamples), DEFAULTS.maxSamples)
  const maxThresholds = asInt(sget('vmu.alerts.maxThresholds', DEFAULTS.maxThresholds), DEFAULTS.maxThresholds)
  const maxFingerprints = asInt(sget('vmu.alerts.maxFingerprints', DEFAULTS.maxFingerprints), DEFAULTS.maxFingerprints)
  const maxSilences = asInt(sget('vmu.alerts.maxSilences', DEFAULTS.maxSilences), DEFAULTS.maxSilences)
  const maxExemptions = asInt(sget('vmu.alerts.maxExemptions', DEFAULTS.maxExemptions), DEFAULTS.maxExemptions)
  const channels = arr(sget('vmu.alerts.channels', []))
  const actionSetting = (() => { const v = sget('vmu.slo.errorBudgetAction', 'freeze-H2'); return ERROR_BUDGET_ACTIONS.includes(v) ? v : 'freeze-H2' })()
  const declaredThresholds = arr(sget('vmu.alerts.thresholds', []))
  const declaredInhibitions = arr(sget('vmu.alerts.inhibitions', [])).filter((i) => i && typeof i.by === 'string').map((i) => ({ by: i.by, targets: arr(i.targets).filter((t) => typeof t === 'string' && t) }))
  const declaredSilences = arr(sget('vmu.alerts.silenceWindows', []))
  const declaredSlo = arr(sget('vmu.slo.targets', [])).filter((t) => t && typeof t === 'object')
  const declaredExemptions = arr(sget('vmu.slo.exemptions', [])).filter((e) => e && typeof e === 'object')
  const configured = declaredThresholds.length > 0 || declaredSlo.length > 0

  // ── state (mutated by declare/undeclare/sample/raise/evaluate/silence/flush/escalate/acknowledge) ──
  const thresholds = new Map()      // id -> declaration
  const samples = new Map()         // metric -> rows (ring, capped; overflow counted)
  const sampleDropped = new Map()   // metric -> dropped rows
  const alerts = new Map()          // fingerprint -> record
  const alertDropped = { n: 0 }
  const silences = new Map()        // id -> window
  const silenceDropped = { n: 0 }
  const exemptions = []
  const exemptionDropped = { n: 0 }
  const counters = { fired: 0, deduped: 0, suppressed: 0, silenced: 0, undecided: 0, evaluated: 0, escalated: 0, escalationDue: 0, summariesDue: 0, summariesDelivered: 0, skips: 0 }
  const refusalCounts = new Map()
  const refusalRows = []

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const dropTotal = () => sumOf(sampleDropped) + alertDropped.n + silenceDropped.n + exemptionDropped.n

  /** Named refusal: COUNTED BY CODE before it is thrown (docs/21 §4.3 #1). */
  const deny = (code, message, hint) => {
    bump(refusalCounts, code, 1)
    if (refusalRows.length >= maxSamples) refusalRows.shift()
    refusalRows.push({ code, message, hint: hint || null, at: clock() })
    say({ type: 'alerts/refused', at: clock(), code, message })
    return refuse(code, message, hint)
  }

  const openFingerprints = () => [...alerts.keys()].filter((f) => alerts.get(f).open).sort()
  const silenceOfFingerprint = (fp, at) => [...silences.values()].filter((s) => s.until > at && (s.fingerprint === null || s.fingerprint === fp))
  const inhibitorFor = (targetName, fp) => {
    for (const inh of declaredInhibitions) {
      if (!inh.targets.includes(targetName) && !inh.targets.includes(fp)) continue
      const rec = alerts.get(String(inh.by))
      if (rec && rec.open) return { by: String(inh.by), source: 'inhibition' }
    }
    return null
  }

  /** The standalone reading path (this module's own samples). */
  const localAggregate = (metric, window, agg, at) => {
    const rows = (samples.get(metric) || []).filter((r) => (window > 0 ? r.atMs >= at - window : true))
    if (rows.length === 0) return { value: null, samples: 0, source: 'local', rows: [] }
    const vals = rows.map((r) => r.value)
    let value
    if (agg === 'sum') value = vals.reduce((a, b) => a + b, 0)
    else if (agg === 'max') value = Math.max(...vals)
    else if (agg === 'min') value = Math.min(...vals)
    else if (agg === 'last') value = vals[vals.length - 1]
    else if (agg === 'count') value = vals.length
    else value = vals.reduce((a, b) => a + b, 0) / vals.length
    return { value: Number(value.toFixed(6)), samples: vals.length, source: 'local', rows: vals.slice() }
  }

  /** The injected-metrics reading path (preferred when available); the interface is the MINIMAL one. */
  const metricAggregate = (metric, window, agg) => {
    if (!metrics || typeof metrics.snapshot !== 'function') return null
    let snap
    try { snap = metrics.snapshot({ window, indicators: [metric] }) } catch (e) { return null }
    const row = snap && Array.isArray(snap.indicators) ? snap.indicators.find((x) => x.name === metric) : null
    if (!row || !row.count) return { value: null, samples: 0, source: 'metrics', rows: [] }
    const value = agg === 'sum' ? row.sum : agg === 'max' ? row.max : agg === 'min' ? row.min
      : agg === 'last' ? row.last : agg === 'count' ? row.count : row.avg
    return { value: typeof value === 'number' ? value : null, samples: row.count, source: 'metrics', rows: [] }
  }
  const aggregate = (metric, window, agg, at) => metricAggregate(metric, window, agg) || localAggregate(metric, window, agg, at)

  const summarizeWindow = (s) => ({
    ok: true, silence: s.id, window: { at: s.at, until: s.until }, reason: s.reason,
    counted: s.counted, byFingerprint: Object.assign({}, s.byFingerprint),
    due: clock() >= s.until, delivered: s.flushedAt !== null, flushedAt: s.flushedAt,
    note: 'SILENCE IS NOT DISCARD (docs/21 §5.3): alerts raised inside the window are counted here and this catch-up summary must be delivered',
  })

  // ── load declarations from settings (BEFORE the API object is returned — never unreachable code) ──
  for (const e of declaredExemptions) {
    if (exemptions.length >= maxExemptions) { exemptionDropped.n += 1; continue }
    exemptions.push({ sli: e.sli || null, from: e.from === undefined ? null : e.from, to: e.to === undefined ? null : e.to, reason: e.reason || null })
  }
  for (const s of declaredSilences) {
    if (!s || typeof s !== 'object') continue
    const until = typeof s.until === 'number' ? s.until : (typeof s.until === 'string' && !Number.isNaN(Date.parse(s.until)) ? Date.parse(s.until) : null)
    if (until === null) continue
    if (silences.size >= maxSilences) { silenceDropped.n += 1; continue }
    const id = String(s.id === undefined || s.id === null ? ('s' + (silences.size + 1)) : s.id)
    silences.set(id, { id, fingerprint: s.fingerprint === undefined || s.fingerprint === null ? null : String(s.fingerprint), until, reason: String(s.reason || 'declared silence'), at: typeof s.at === 'number' ? s.at : clock(), counted: 0, byFingerprint: {}, flushedAt: null })
  }
  for (const t of declaredThresholds) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id) continue
    if (thresholds.size >= maxThresholds) { alertDropped.n += 1; continue }
    thresholds.set(t.id, {
      id: t.id, metric: String(t.metric || ''), window: Number.isInteger(t.window) ? t.window : 0,
      op: OPS.includes(String(t.op)) ? String(t.op) : '>=', threshold: typeof t.threshold === 'number' ? t.threshold : 0,
      object: t.object === undefined ? null : t.object, code: t.code === undefined ? null : t.code,
      severity: String(t.severity || 'warning'), agg: String(t.agg || 'avg'), channels: arr(t.channels), declaredAt: clock(),
    })
  }
  counters.skips += configured ? 0 : 1

  const api = {
    apiVersion,

    /** Declare a threshold. Idempotent for an identical re-declaration; a conflicting one is a NAMED refusal. */
    declare({ id, metric, window = 0, op = '>=', threshold, object = null, code = null, severity = 'warning', agg = 'avg', channels: ch = null } = {}) {
      if (typeof id !== 'string' || !id) throw deny('VMU_INVALID_ARGUMENT', 'declare needs a non-empty threshold id', 'e.g. { id: "t-refusal", metric: "refusalRate", op: ">", threshold: 0.1 }')
      if (typeof metric !== 'string' || !metric) throw deny('VMU_INVALID_ARGUMENT', 'declare needs a metric name for ' + id, 'the metric is the first part of the alert fingerprint (metric×object×code)')
      if (!OPS.includes(String(op))) throw deny('VMU_INVALID_ARGUMENT', 'unsupported threshold operator: ' + String(op), 'use one of ' + OPS.join(', '))
      if (typeof threshold !== 'number' || !Number.isFinite(threshold)) throw deny('VMU_INVALID_ARGUMENT', 'declare needs a finite numeric threshold for ' + id, 'a threshold must be decidable: "metric op value"')
      if (!Number.isInteger(window) || window < 0) throw deny('VMU_INVALID_ARGUMENT', 'declare window must be an integer >= 0 for ' + id, '0 means "all samples"')
      if (code !== null && (typeof code !== 'string' || !code)) throw deny('VMU_INVALID_ARGUMENT', 'declare code must be a non-empty string when given', 'the code is the third part of the fingerprint (metric×object×code)')
      const entry = { id, metric, window, op: String(op), threshold, object, code, severity, agg, channels: ch === null ? channels.slice() : arr(ch), declaredAt: clock() }
      const prev = thresholds.get(id)
      if (prev) {
        const same = prev.metric === entry.metric && prev.window === entry.window && prev.op === entry.op
          && prev.threshold === entry.threshold && prev.object === entry.object && prev.code === entry.code
        if (same) return { ok: true, deduped: true, id, threshold: Object.assign({}, prev) }
        throw deny('VMU_CONFLICT', 'threshold id already declared with different fields: ' + id,
          'use a new id, or undeclare() first — conflicts are never resolved silently (docs/21 §5.3)')
      }
      if (thresholds.size >= maxThresholds) {
        alertDropped.n += 1
        say({ type: 'alerts/dropped', at: clock(), what: 'threshold', id, cap: maxThresholds })
        throw deny('VMU_RESOURCE_BUDGET', 'threshold cap reached (' + thresholds.size + '/' + maxThresholds + '): ' + id,
          'raise vmu.alerts.maxThresholds; every dropped threshold is counted (docs/21 §4.3 #1)')
      }
      thresholds.set(id, entry)
      say({ type: 'alerts/declared', at: clock(), id, metric, op: entry.op, threshold })
      return { ok: true, declared: true, id, threshold: Object.assign({}, entry) }
    },

    /** Remove a declaration (named refusal when unknown). Raised alerts are kept — history is not hidden. */
    undeclare({ id } = {}) {
      if (!thresholds.has(String(id))) throw deny('VMU_NO_SUCH_OBJECT', 'no such threshold: ' + String(id), 'declared: ' + ([...thresholds.keys()].sort().join(', ') || 'none'))
      thresholds.delete(String(id))
      say({ type: 'alerts/undeclared', at: clock(), id: String(id) })
      return { ok: true, undeclared: true, id: String(id) }
    },

    /** Inhibitions: `by` (a fingerprint) suppresses the `targets` while `by` is OPEN (docs/21 §5.3). */
    inhibit({ by, targets } = {}) {
      if (typeof by !== 'string' || !by) throw deny('VMU_INVALID_ARGUMENT', 'inhibit needs `by` (the superior alert fingerprint)', 'e.g. { by: "storage×-×-", targets: ["t-refusal"] }')
      const list = arr(targets).filter((t) => typeof t === 'string' && t)
      if (list.length === 0) throw deny('VMU_INVALID_ARGUMENT', 'inhibit needs a non-empty targets list', 'targets may name threshold ids or alert fingerprints')
      declaredInhibitions.push({ by, targets: list })
      return { ok: true, inhibition: { by, targets: list }, total: declaredInhibitions.length }
    },

    /** Record one local observation (the STANDALONE reading path; metrics injection supersedes it). */
    sample({ metric, value, at = null, object = null, code = null } = {}) {
      if (typeof metric !== 'string' || !metric) throw deny('VMU_INVALID_ARGUMENT', 'sample needs a metric name', 'e.g. { metric: "refusalRate", value: 0.2 }')
      if (typeof value !== 'number' || !Number.isFinite(value)) throw deny('VMU_INVALID_ARGUMENT', 'sample needs a finite numeric value for ' + metric, 'value was: ' + String(value))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'sample `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const rows = samples.get(metric) || []
      rows.push({ metric, value, at: ms, atMs: ms, object, code })
      while (rows.length > maxSamples) {
        rows.shift()
        bump(sampleDropped, metric, 1)
        say({ type: 'alerts/dropped', at: clock(), what: 'sample', metric, cap: maxSamples })
      }
      samples.set(metric, rows)
      return { ok: true, sampled: true, metric, value, at: ms, index: rows.length - 1 }
    },

    /**
     * Raise one alert at ALERT level. The fingerprint is `metric × object × code` (docs/21 §5.3, hard).
     * Order: inhibition ⇒ silence ⇒ dedup ⇒ notify. SILENCED and SUPPRESSED alerts are COUNTED, never
     * dropped, and both NAME their source (a refusal that cannot name its suppressor is useless).
     */
    raise({ metric, object = null, code = null, at = null, detail = null, thresholdId = null, severity = 'warning' } = {}) {
      if (typeof metric !== 'string' || !metric) throw deny('VMU_INVALID_ARGUMENT', 'raise needs a metric name', 'e.g. { metric: "refusalRate", object: "tools/set", code: "VMU_NOT_PERMITTED" }')
      if (code !== null && (typeof code !== 'string' || !code)) throw deny('VMU_INVALID_ARGUMENT', 'raise code must be a non-empty string when given', 'the code is part of the fingerprint')
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'raise `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const fp = fingerprintOf({ metric, object, code })
      let rec = alerts.get(fp)
      if (!rec) {
        if (alerts.size >= maxFingerprints) {
          alertDropped.n += 1
          say({ type: 'alerts/dropped', at: ms, what: 'fingerprint', fingerprint: fp, cap: maxFingerprints })
          throw deny('VMU_RESOURCE_BUDGET', 'alert cap reached (' + alerts.size + '/' + maxFingerprints + '): ' + fp,
            'raise vmu.alerts.maxFingerprints; every dropped fingerprint is counted')
        }
        rec = { fingerprint: fp, metric, object, code, severity, firstAt: ms, lastAt: ms, count: 0, fired: 0, deduped: 0, silenced: 0, suppressed: 0, lastFiredAt: null, open: true, escalations: 0, acknowledgedAt: null, escalationDue: false, detail: null }
        alerts.set(fp, rec)
      }
      rec.count += 1
      rec.lastAt = ms
      counters.fired += 1
      if (detail !== null) rec.detail = String(detail)

      const inh = inhibitorFor(thresholdId === null ? fp : String(thresholdId), fp)
      if (inh) {
        rec.suppressed += 1
        counters.suppressed += 1
        say({ type: 'alerts/suppressed', at: ms, fingerprint: fp, by: inh.by })
        return { ok: true, notified: false, suppressed: true, code: ALERT_CODES.SUPPRESSED, fingerprint: fp, suppressedBy: inh.by, source: inh.source, reason: 'inhibited by an open superior alert', at: ms, alert: Object.assign({}, rec) }
      }

      const sil = silenceOfFingerprint(fp, ms)
      if (sil.length) {
        const s = sil[0]
        s.counted += 1
        s.byFingerprint[fp] = (s.byFingerprint[fp] || 0) + 1
        rec.silenced += 1
        counters.silenced += 1
        say({ type: 'alerts/silenced', at: ms, fingerprint: fp, silence: s.id, until: s.until, reason: s.reason })
        return { ok: true, notified: false, silenced: true, code: ALERT_CODES.SILENCED, fingerprint: fp, silencedBy: s.id, silenceReason: s.reason, until: s.until, summaryDue: true, at: ms, alert: Object.assign({}, rec) }
      }

      const last = rec.lastFiredAt
      if (last !== null && (ms - last) < dedupWindowMs) {
        rec.deduped += 1
        counters.deduped += 1
        say({ type: 'alerts/deduped', at: ms, fingerprint: fp, window: dedupWindowMs, since: ms - last })
        return { ok: true, notified: false, deduped: true, fingerprint: fp, dedupWindowMs, since: ms - last, at: ms, alert: Object.assign({}, rec) }
      }

      rec.fired += 1
      rec.lastFiredAt = ms
      rec.open = true
      const notification = { fingerprint: fp, metric, object, code, severity: rec.severity, channels: channels.slice(), at: ms, detail: rec.detail, note: 'alert-level fingerprint (metric×object×code); DELIVERY belongs to the 17-volume notification face' }
      emit({ type: 'alerts/fired', at: ms, notification })
      say({ type: 'alerts/fired', at: ms, fingerprint: fp, channels: notification.channels })
      return { ok: true, notified: true, fingerprint: fp, code, channels: notification.channels, notification, at: ms, alert: Object.assign({}, rec) }
    },

    /**
     * Evaluate every declared threshold over the injected window. A threshold with NO samples is
     * `undecided` (counted) — never a silent pass. `rate>`/`rate<` need TWO local samples: with only an
     * injected metrics reading the module refuses to guess and reports `undecided` (honest arithmetic).
     */
    evaluate({ at = null, autoEscalate: auto = null } = {}) {
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'evaluate `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const ids = [...thresholds.keys()].sort()
      const results = []
      for (const id of ids) {
        const t = thresholds.get(id)
        counters.evaluated += 1
        const isRate = t.op === 'rate>' || t.op === 'rate<'
        const a = aggregate(t.metric, t.window, isRate ? 'last' : t.agg, ms)
        if (a.value === null || a.samples === 0) {
          counters.undecided += 1
          results.push({ ok: true, id, metric: t.metric, op: t.op, threshold: t.threshold, actual: null, samples: 0, state: 'undecided', fired: false, reason: 'no samples in window (undecided, not a silent pass)', source: a.source, at: ms })
          continue
        }
        let actual = a.value
        let fired = false
        if (isRate) {
          if (a.source !== 'local' || a.rows.length < 2) {
            counters.undecided += 1
            results.push({ ok: true, id, metric: t.metric, op: t.op, threshold: t.threshold, actual: null, samples: a.samples, state: 'undecided', fired: false, reason: 'rate needs two local samples (undecided; an injected metrics reading cannot supply the previous sample)', source: a.source, at: ms })
            continue
          }
          actual = Number((a.rows[a.rows.length - 1] - a.rows[a.rows.length - 2]).toFixed(6))
          fired = t.op === 'rate>' ? actual > t.threshold : actual < t.threshold
        } else {
          fired = cmp(actual, t.op, t.threshold)
        }
        let outcome = null
        if (fired) outcome = api.raise({ metric: t.metric, object: t.object, code: t.code, at: ms, thresholdId: id, severity: t.severity, detail: 'threshold ' + id + ': ' + t.metric + ' ' + t.op + ' ' + t.threshold + ' (actual ' + actual + ', ' + a.samples + ' samples)' })
        results.push({ ok: true, id, metric: t.metric, op: t.op, threshold: t.threshold, actual, samples: a.samples, state: fired ? 'fired' : 'ok', fired, notified: outcome ? outcome.notified === true : false, deduped: outcome ? outcome.deduped === true : false, silenced: outcome ? outcome.silenced === true : false, suppressed: outcome ? outcome.suppressed === true : false, source: a.source, at: ms })
      }
      const escalationDue = []
      for (const fp of openFingerprints()) {
        const rec = alerts.get(fp)
        if (rec.acknowledgedAt !== null || rec.lastFiredAt === null) continue
        if (ms - rec.lastFiredAt >= escalateAfterMs) {
          rec.escalationDue = true
          counters.escalationDue += 1
          escalationDue.push(fp)
          if (auto === null ? autoEscalate : auto === true) { try { api.escalate({ id: fp, at: ms }) } catch (e) { /* surfaced through status() */ } }
        }
      }
      const summariesDue = [...silences.values()].filter((s) => clock() >= s.until && s.flushedAt === null).map((s) => s.id).sort()
      counters.summariesDue = summariesDue.length
      return { ok: true, at: ms, evaluated: results.length, fired: results.filter((r) => r.fired).length, undecided: results.filter((r) => r.state === 'undecided').length, results, escalationDue, summariesDue }
    },

    /**
     * Open a silence window (docs/21 §5.3). `id` names the window; `fingerprint` optionally narrows it to
     * one alert (omitted ⇒ all alerts). SILENCE IS NOT DISCARD: alerts in the window are counted and a
     * catch-up summary falls due at `until`.
     */
    silence({ id = null, fingerprint = null, ms, reason = 'maintenance', at = null } = {}) {
      if (!Number.isInteger(ms) || ms <= 0) throw deny('VMU_INVALID_ARGUMENT', 'silence needs a positive integer `ms`', 'e.g. { ms: 3600000, reason: "planned maintenance" }')
      if (typeof reason !== 'string' || !reason) throw deny('VMU_INVALID_ARGUMENT', 'silence needs a reason (an unexplained silence is indistinguishable from a bug)', 'the reason is part of the catch-up summary')
      const msAt = atMs(at)
      if (msAt === null) throw deny('VMU_INVALID_ARGUMENT', 'silence `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const silId = String(id === null ? (fingerprint === null ? 'all' : fingerprint) : id)
      if (silences.size >= maxSilences) {
        silenceDropped.n += 1
        say({ type: 'alerts/dropped', at: msAt, what: 'silence', id: silId, cap: maxSilences })
        throw deny('VMU_RESOURCE_BUDGET', 'silence cap reached (' + silences.size + '/' + maxSilences + '): ' + silId,
          'raise vmu.alerts.maxSilences; every dropped silence window is counted')
      }
      const s = { id: silId, fingerprint: fingerprint === null ? null : String(fingerprint), until: msAt + ms, reason, at: msAt, counted: 0, byFingerprint: {}, flushedAt: null }
      silences.set(silId, s)
      say({ type: 'alerts/silence-window', at: msAt, id: silId, until: s.until, reason })
      return { ok: true, silenced: true, id: silId, until: s.until, reason, note: 'SILENCE IS NOT DISCARD: alerts raised in this window are counted and a catch-up summary is due at `until`' }
    },

    /** Read-only: the catch-up summaries (one per silence window). `due:true` means it MUST be delivered. */
    summaries({ id = null } = {}) {
      const list = [...silences.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
        .filter((s) => id === null || s.id === String(id))
        .map((s) => summarizeWindow(s))
      return { ok: true, count: list.length, due: list.filter((s) => s.due && !s.delivered).length, summaries: list, at: clock() }
    },

    /** Deliver a catch-up summary (COUNTED). Unknown silence ⇒ refusal; not-yet-due ⇒ refusal with the wait. */
    flush({ id } = {}) {
      const s = silences.get(String(id))
      if (!s) throw deny('VMU_NO_SUCH_OBJECT', 'no such silence window: ' + String(id), 'known: ' + ([...silences.keys()].sort().join(', ') || 'none'))
      if (clock() < s.until) throw deny('VMU_STATE', 'silence window is still open until ' + s.until + ': ' + s.id, 'wait ' + (s.until - clock()) + 'ms, or flush after `until`')
      if (s.flushedAt === null) { s.flushedAt = clock(); counters.summariesDelivered += 1 }
      const out = summarizeWindow(s)
      emit({ type: 'alerts/summary', at: clock(), summary: out })
      say({ type: 'alerts/summary-delivered', at: clock(), id: s.id, counted: s.counted })
      return Object.assign({ delivered: true }, out)
    },

    /** Escalate an OPEN, unacknowledged alert (docs/21 §5.3). Named refusals when too early / acked. */
    escalate({ id, at = null, channel = null } = {}) {
      const fp = String(id)
      const rec = alerts.get(fp)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'no such alert fingerprint: ' + fp, 'open: ' + (openFingerprints().join(', ') || 'none'))
      if (!rec.open) throw deny('VMU_STATE', 'alert is not open: ' + fp, 'a closed alert cannot be escalated')
      if (rec.acknowledgedAt !== null) throw deny('VMU_STATE', 'alert was acknowledged at ' + rec.acknowledgedAt + ': ' + fp, 'acknowledged alerts do not escalate')
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'escalate `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (rec.lastFiredAt !== null && (ms - rec.lastFiredAt) < escalateAfterMs) {
        throw deny('VMU_STATE', 'alert has not been unacknowledged for vmu.alerts.escalateAfterMs yet: ' + fp,
          'wait ' + (escalateAfterMs - (ms - rec.lastFiredAt)) + 'ms (escalateAfterMs=' + escalateAfterMs + ')')
      }
      rec.escalations += 1
      rec.escalationDue = false
      counters.escalated += 1
      const target = channel === null ? (channels.length ? channels[rec.escalations % channels.length] : null) : String(channel)
      const out = { ok: true, escalated: true, fingerprint: fp, level: rec.escalations, channel: target, at: ms }
      emit({ type: 'alerts/escalated', at: ms, escalation: out })
      say({ type: 'alerts/escalated', at: ms, fingerprint: fp, level: rec.escalations, channel: target })
      return out
    },

    /** Acknowledge an alert (stops escalation; the record stays). */
    acknowledge({ id, at = null } = {}) {
      const rec = alerts.get(String(id))
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'no such alert fingerprint: ' + String(id), 'open: ' + (openFingerprints().join(', ') || 'none'))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'acknowledge `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      rec.acknowledgedAt = ms
      rec.escalationDue = false
      say({ type: 'alerts/acknowledged', at: ms, fingerprint: rec.fingerprint })
      return { ok: true, acknowledged: true, fingerprint: rec.fingerprint, at: ms }
    },

    /**
     * SLO error budget (docs/21 §13). THREE-VALUED: no samples ⇒ `state:'undecided'` (never a pass); an
     * active exemption ⇒ `state:'exempt'` (recorded with its reason). The reading goes through
     * metrics.kpi() when injected, so this module cannot self-certify a different arithmetic.
     */
    budget({ sli, at = null, requests = null } = {}) {
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'budget `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const target = declaredSlo.find((t) => t.id === sli || t.sli === sli || t.metric === sli)
      if (!target) throw deny('VMU_NO_SUCH_OBJECT', 'no such SLI: ' + String(sli), 'declared: ' + (declaredSlo.map((t) => t.id || t.sli || t.metric).filter(Boolean).join(', ') || 'none — add vmu.slo.targets[]'))
      if (typeof target.target !== 'number' || !Number.isFinite(target.target)) throw deny('VMU_INVALID_ARGUMENT', 'SLO target needs a finite numeric target: ' + String(sli), 'a target must be decidable (docs/21 §13)')
      const base = {
        ok: true, sli: target.id || target.sli || target.metric, metric: target.metric || target.sli, op: String(target.op || '>='),
        target: target.target, window: Number.isInteger(target.window) ? target.window : 0, action: actionSetting, at: ms,
      }
      const exempt = exemptions.find((e) => (e.sli === sli || e.sli === base.sli) && typeof e.from === 'number' && typeof e.to === 'number' && ms >= e.from && ms <= e.to)
      if (exempt) return Object.assign(base, { state: 'exempt', exempt: true, exemptReason: exempt.reason || null, samples: null, actual: null, usedFraction: null, remaining: null, exhausted: false, code: null, note: 'inside a declared exemption window (docs/21 §13): reported, never used to certify a pass' })

      let actual = null; let samples = 0; let source = 'local'
      if (metrics && typeof metrics.kpi === 'function') {
        let k = null
        try { k = metrics.kpi({ name: base.metric, op: base.op, target: target.target, agg: target.agg || 'avg', window: base.window }) } catch (e) { k = null }
        if (k) { samples = k.samples || 0; actual = typeof k.actual === 'number' ? k.actual : null; source = 'metrics' }
      }
      if (samples === 0) {
        const a = localAggregate(base.metric, base.window, target.agg || 'avg', ms)
        samples = a.samples; actual = a.value; source = a.samples ? 'local' : source
      }
      if (samples === 0 || actual === null) {
        return Object.assign(base, { state: 'undecided', samples: 0, actual: null, usedFraction: null, remaining: null, exhausted: null, source, code: null, reason: 'no samples in window (undecided, not a silent pass)' })
      }
      const good = cmp(actual, base.op, base.target)
      const budgetWidth = base.op === '>=' || base.op === '>' ? (1 - base.target) : (base.target || 1)
      const deficit = base.op === '>=' || base.op === '>' ? Math.max(0, base.target - actual) : Math.max(0, actual - base.target)
      const usedFraction = budgetWidth > 0 ? Math.min(1, Number((deficit / budgetWidth).toFixed(6))) : (good ? 0 : 1)
      const exhausted = !good && usedFraction >= 1
      const req = Number.isInteger(requests) && requests > 0 ? requests : samples
      return Object.assign(base, {
        state: good ? 'met' : 'breached', samples, actual, requests: req, source,
        budgetWidth: Number(budgetWidth.toFixed(6)), deficit: Number(deficit.toFixed(6)),
        usedFraction, remaining: Number((1 - usedFraction).toFixed(6)), exhausted,
        code: exhausted ? ALERT_CODES.BUDGET_EXHAUSTED : null,
        note: good ? 'SLO target met' : 'SLO target not met; the error budget consumes until exhausted, then errorBudgetAction applies (H0/H1 firefighting is exempt and audited)',
      })
    },

    /**
     * Enforce the error-budget punishment (docs/21 §13): with an exhausted budget an H2 change is REFUSED
     * BY NAME; H0/H1 firefighting is allowed and the exception is audited. 'warn'/'none' never refuse.
     */
    guardChange({ sli, hot = 'H2', at = null, what = 'change' } = {}) {
      const b = api.budget({ sli, at })
      const blocked = b.exhausted === true && b.action === 'freeze-H2' && String(hot) === 'H2'
      if (blocked) {
        say({ type: 'alerts/change-refused', at: b.at, sli: b.sli, hot: String(hot), what, code: ALERT_CODES.BUDGET_EXHAUSTED })
        return { ok: false, refused: true, code: ALERT_CODES.BUDGET_EXHAUSTED, sli: b.sli, hot: String(hot), action: b.action, usedFraction: b.usedFraction, message: 'error budget exhausted: H2 change refused', hint: 'H0/H1 firefighting is allowed and audited; otherwise restore the SLO or record an exemption', at: b.at }
      }
      if (String(hot) !== 'H2' && b.exhausted === true) say({ type: 'alerts/change-exempt', at: b.at, sli: b.sli, hot: String(hot), what, reason: 'firefighting change (H0/H1) during an exhausted budget' })
      return { ok: true, refused: false, sli: b.sli, hot: String(hot), action: b.action, state: b.state, exhausted: b.exhausted, at: b.at }
    },

    /** Read-only runbook lookup (docs/21 §14). Matches by CODE (the judgement column) or by runbook id. */
    runbook({ code = null, id = null } = {}) {
      if (code === null && id === null) throw deny('VMU_INVALID_ARGUMENT', 'runbook needs a code or an id', 'e.g. { code: "VMU_STORE_FAILED" } — see 18-§7 for the disposition of every code')
      const hits = RUNBOOK.filter((r) => (id !== null ? r.id === String(id) : false) || (code !== null ? r.codes.includes(String(code)) : false))
      if (hits.length === 0) {
        throw deny('VMU_NO_SUCH_OBJECT', 'no runbook entry for ' + (code !== null ? 'code ' + String(code) : 'id ' + String(id)),
          'known codes: ' + ([...new Set(RUNBOOK.flatMap((r) => r.codes))].sort().join(', ') || 'none'))
      }
      return { ok: true, count: hits.length, entries: hits.map((r) => ({ id: r.id, fingerprint: r.fingerprint, steps: r.steps.slice(), acceptance: r.acceptance })), at: clock() }
    },

    /** Read-only self-report (docs/21 §5): what is declared, capped, counted and currently open. */
    status() {
      const summariesDue = [...silences.values()].filter((s) => clock() >= s.until && s.flushedAt === null).map((s) => s.id).sort()
      let samplesTotal = 0
      for (const rows of samples.values()) samplesTotal += rows.length
      return {
        ok: true,
        configured,
        apiVersion,
        dedupWindowMs, escalateAfterMs, autoEscalate, action: actionSetting,
        channels: channels.slice(),
        thresholds: [...thresholds.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((t) => Object.assign({}, t)),
        inhibitions: declaredInhibitions.map((i) => ({ by: i.by, targets: i.targets.slice() })),
        openAlerts: openFingerprints().map((fp) => Object.assign({}, alerts.get(fp))),
        silences: [...silences.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((s) => summarizeWindow(s)),
        summariesDue,
        slo: declaredSlo.map((t) => ({ id: t.id || t.sli || t.metric || null, metric: t.metric || t.sli || null, op: String(t.op || '>='), target: t.target, window: Number.isInteger(t.window) ? t.window : 0 })),
        exemptions: exemptions.slice(),
        counters: Object.assign({}, counters),
        refusals: objOf(refusalCounts),
        refusalsTotal: sumOf(refusalCounts),
        dropped: { samples: objOf(sampleDropped), alerts: alertDropped.n, silences: silenceDropped.n, exemptions: exemptionDropped.n, total: dropTotal() },
        caps: { maxSamples, maxThresholds, maxFingerprints, maxSilences, maxExemptions },
        samplesTotal,
        at: clock(),
        note: 'ops judgement surface (docs/21 §5/§13/§14): alert fingerprint=metric×object×code (NOT the 17-volume watcher×event×object), silence is counted not dropped, no samples ⇒ undecided',
      }
    },
  }
  return api
}
