// vmu kernel · metrics — the JUDGEMENT layer's counting surface (docs/21 §1/§4/§15).
//
// Design source: docs/21-observability-and-operations.md
//   §1   three observation layers (events → correlation → judgement) + the invariant "计数不静默"
//   §4.1 the indicator catalogue (throughput / cycle time / backlog / WIP / failure rate / refusal rate /
//        budget use / breaker / truncation rate / timeline density / storage / cost)
//   §4.3 the three counting disciplines (this module IS their implementation):
//        ① NOTHING IS SILENTLY DROPPED — every upper bound reports how many items were dropped
//        ② EVERY COUNT IS EXPLAINABLE  — every indicator can name WHO recorded it and WHEN
//        ③ SAMPLING SELF-DISCLOSES     — sampled rows carry `sampled:true` + the rate, and the rows that
//          were NOT sampled are counted (`sampledOut`); CHANGE / REFUSAL / SETTLEMENT rows are NEVER sampled
//   §15  explainability ("why was this refused / truncated / who recorded what")
// Settings (docs/21 §4):
//   vmu.metrics.windowMs | indicators | allowTrigger | exportFormat    (registered in settings/planned.js)
//   vmu.metrics.sampleHighVolume | sampleRate | seriesCap              (documented candidates, tolerant read)
// Invariants (same set as the rest of the kernel — see kernel/board.js):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent
//   · unconfigured ⇒ zero mechanism: snapshot() is empty, nothing throws, observations are SKIPPED (counted)
//   · the only time source is the injected `clock` (never reads real time, never random ⇒ byte-deterministic)
//   · READ paths (snapshot/series/counters/explain/status/export) never mutate the RECORDED data; they may
//     only increment the refusal counters of an INVALID request (which throws anyway) — with valid input,
//     repeated reads are byte-identical
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The judgement-layer indicator catalogue (docs/21 §4.1). Extra names are accepted but marked `declared:false`. */
export const METRIC_CATALOGUE = Object.freeze([
  'throughput', 'cycleTime', 'backlog', 'wip', 'failureRate', 'refusalRate',
  'budgetUse', 'breaker', 'truncationRate', 'traceDensity', 'storage', 'cost',
])

/** Kinds that must NEVER be sampled (docs/21 §4.3 discipline ③ + the task's hard rule). */
export const NEVER_SAMPLED_KINDS = Object.freeze(['change', 'refusal', 'settlement', 'decision', 'mutation'])

const TRIGGER_CODE = 'VMU_METRICS_TRIGGER_FORBIDDEN'
const UNAVAILABLE_CODE = 'VMU_METRIC_UNAVAILABLE'
const DEFAULT_SERIES_CAP = 200

/**
 * createMetrics — the counting surface. `clock` returns ms (injected, never real time).
 * `settings` accepts a plain object or a Map-like with get(); `log` is an advisory audit ring; `bus` is advisory.
 */
export function createMetrics({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createMetrics needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the metric being logged */ } }
  }
  const emit = (event) => {
    if (bus && typeof bus.emit === 'function') { try { bus.emit(event) } catch (e) { /* the bus is advisory */ } }
  }

  const asPositiveInt = (v, def) => (Number.isInteger(v) && v > 0 ? v : def)
  const declaredRaw = sget('vmu.metrics.indicators', null)
  const declared = Array.isArray(declaredRaw) ? declaredRaw.filter((x) => typeof x === 'string' && x).slice() : []
  const configured = declared.length > 0
  const seriesCap = asPositiveInt(sget('vmu.metrics.seriesCap', DEFAULT_SERIES_CAP), DEFAULT_SERIES_CAP)
  const sampleRequested = sget('vmu.metrics.sampleHighVolume', false) === true
  const rateRaw = sget('vmu.metrics.sampleRate', 1)
  const sampleRate = sampleRequested ? (typeof rateRaw === 'number' && rateRaw > 0 && rateRaw <= 1 ? rateRaw : 1) : 0
  const stride = sampleRequested && sampleRate > 0 ? Math.max(1, Math.round(1 / sampleRate)) : 0
  const allowTrigger = sget('vmu.metrics.allowTrigger', false) === true
  const exportFormat = sget('vmu.metrics.exportFormat', 'json') === 'jsonl' ? 'jsonl' : 'json'
  const windowSetting = Number.isInteger(sget('vmu.metrics.windowMs', 0)) && sget('vmu.metrics.windowMs', 0) > 0 ? sget('vmu.metrics.windowMs', 0) : 0

  // ── state (mutated only by observe(); every read path below is pure over RECORDED data) ─────────────
  const series = new Map()        // name -> rows (ring, capped at seriesCap; overflow counted in `dropped`)
  const sampler = new Map()       // name -> count of samplable read observations (deterministic stride sampler)
  const dropped = new Map()       // name -> dropped row count
  const sampledOut = new Map()    // name -> read rows NOT sampled (sampling self-disclosure)
  const refusalCounts = new Map() // CODE -> count (docs/21 §4.3 #1: refusals are grouped by code)
  const refusalRows = []          // ring of refusal rows (capped, overflow counted)
  const droppedRows = { n: 0 }
  const skips = { unconfigured: 0 }
  const unwired = new Map()       // name -> count of WIRING GAPS reported (docs/21 §4.3 #3: unwired is counted)
  let observedTotal = 0
  let sampledTotal = 0

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const dropTotal = () => sumOf(dropped) + droppedRows.n

  /** Named refusal helper — discipline ①/②: a refusal is COUNTED BY CODE before it is thrown. */
  const deny = (code, message, hint) => {
    bump(refusalCounts, code, 1)
    if (refusalRows.length >= seriesCap) { refusalRows.shift(); droppedRows.n += 1 }
    refusalRows.push({ code, message, hint: hint || null, at: clock() })
    say({ type: 'metrics/refused', at: clock(), code, message })
    return refuse(code, message, hint)
  }

  const knownName = (name) => declared.includes(name)
  const catalogueName = (name) => METRIC_CATALOGUE.includes(name)
  const readRows = (name, window) => {
    const rows = series.get(name) || []
    if (!window || window <= 0) return rows.slice()
    const floor = clock() - window
    return rows.filter((r) => typeof r.atMs === 'number' && r.atMs >= floor)
  }

  const computeCounters = () => ({
    ok: true,
    configured,
    refusals: objOf(refusalCounts),
    refusalsTotal: sumOf(refusalCounts),
    skips: Object.assign({}, skips),
    skippedTotal: Object.values(skips).reduce((a, b) => a + b, 0),
    dropped: objOf(dropped),
    droppedTotal: dropTotal(),
    droppedRows: droppedRows.n,
    sampledOut: objOf(sampledOut),
    sampledOutTotal: sumOf(sampledOut),
    unwired: objOf(unwired),
    unwiredTotal: sumOf(unwired),
    observedTotal,
    sampledTotal,
    at: clock(),
  })

  const computeSnapshot = ({ window = null, indicators = null } = {}) => {
    // `null`/omitted ⇒ the declared window (vmu.metrics.windowMs); an explicit 0 ⇒ "everything".
    const win = window === null || window === undefined
      ? windowSetting
      : (Number.isInteger(window) && window >= 0 ? window : windowSetting)
    const names = (Array.isArray(indicators) && indicators.length ? indicators.filter((x) => typeof x === 'string') : (configured ? declared : []))
    const out = []
    for (const name of names) {
      const rows = readRows(name, win)
      if (rows.length === 0) {
        out.push({ name, count: 0, sum: 0, min: null, max: null, avg: null, last: null, firstAt: null, lastAt: null, by: [], sources: [], sampled: 0, unsampled: 0, declared: catalogueName(name) || knownName(name) })
        continue
      }
      let sum = 0; let min = Infinity; let max = -Infinity; let sampled = 0
      const bys = new Set(); const sources = new Set()
      for (const r of rows) {
        sum += r.value
        if (r.value < min) min = r.value
        if (r.value > max) max = r.value
        if (r.sampled) sampled += 1
        if (r.by !== null && r.by !== undefined) bys.add(r.by)
        if (r.source !== null && r.source !== undefined) sources.add(r.source)
      }
      out.push({
        name, count: rows.length, sum: Number(sum.toFixed(6)), min, max,
        avg: Number((sum / rows.length).toFixed(6)), last: rows[rows.length - 1].value,
        firstAt: rows[0].at, lastAt: rows[rows.length - 1].at,
        by: [...bys].sort(), sources: [...sources].sort(), sampled, unsampled: rows.length - sampled,
        declared: catalogueName(name) || knownName(name),
      })
    }
    out.sort((a, b) => (a.name < b.name ? -1 : 1))
    return {
      ok: true,
      configured,
      windowMs: win,
      at: clock(),
      indicators: out,
      count: out.length,
      observations: observedTotal,
      sampled: sampleRequested
        ? { enabled: true, rate: sampleRate, stride, sampledTotal, sampledOut: objOf(sampledOut) }
        : { enabled: false, rate: 0, sampledTotal: 0, sampledOut: {} },
      dropped: objOf(dropped),
      droppedTotal: dropTotal(),
      refusedTotal: sumOf(refusalCounts),
      note: 'judgement layer (docs/21 §4); every upper bound counts its drops and every refusal is counted by code',
    }
  }

  return {
    apiVersion,

    /**
     * Record one observation. `kind` ∈ {read (default), change, refusal, settlement, decision, mutation}.
     * Read rows may be sampled (when declared); change/refusal/settlement rows are NEVER sampled.
     */
    observe({ name, value, at = null, labels = null, by = 'unspecified', source = null, kind = 'read', sampled = null } = {}) {
      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'observe needs a non-empty indicator name', 'e.g. { name: "refusalRate", value: 1, by: "tools/set" }')
      if (configured && !knownName(name)) {
        throw deny(UNAVAILABLE_CODE, 'indicator not in vmu.metrics.indicators: ' + name,
          'declared: ' + declared.join(', ') + ' — add it to vmu.metrics.indicators, or observe a declared one')
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw deny('VMU_INVALID_ARGUMENT', 'observe needs a finite numeric value for ' + name, 'value was: ' + String(value))
      }
      const atMs = at === null
        ? clock()
        : (typeof at === 'number' && Number.isFinite(at) ? at : (typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : null))
      if (atMs === null) throw deny('VMU_INVALID_ARGUMENT', 'observe `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (by !== null && typeof by !== 'string') throw deny('VMU_INVALID_ARGUMENT', 'observe `by` must be a string (who recorded it)', 'explainability requires naming the recorder')

      // ZERO MECHANISM: with no declared indicators nothing is recorded — and the skip is COUNTED, never silent.
      if (!configured) {
        skips.unconfigured += 1
        say({ type: 'metrics/skipped', at: atMs, indicator: name, reason: 'no indicators declared (zero mechanism)' })
        return { ok: true, recorded: false, configured: false, name, reason: 'no indicators declared (zero mechanism)', at: atMs }
      }

      const unsamplable = NEVER_SAMPLED_KINDS.includes(String(kind))
      let isSampled = false
      let overrideIgnored = false
      if (unsamplable) {
        // discipline ③ (hard): changes/refusals/settlements are never sampled — and a caller asking for
        // sampling is TOLD it was ignored instead of being silently overruled.
        if (sampled === true) overrideIgnored = true
      } else if (sampleRequested && stride > 0) {
        const n = (sampler.get(name) || 0) + 1
        sampler.set(name, n)
        isSampled = n % stride === 0
        if (!isSampled) {
          bump(sampledOut, name, 1)
          return { ok: true, recorded: false, sampled: false, sampleRate, sampledOut: true, name, at: atMs, reason: 'sampled out (deterministic stride ' + stride + ')' }
        }
      }

      const row = {
        name, value, at: atMs, atMs,
        labels: labels && typeof labels === 'object' ? Object.assign({}, labels) : null,
        by, source, kind: String(kind), sampled: isSampled, sampleRate: isSampled ? sampleRate : 0,
        declared: catalogueName(name) || knownName(name),
      }
      if (overrideIgnored) row.sampleOverrideIgnored = true
      const rows = series.get(name) || []
      rows.push(row)
      while (rows.length > seriesCap) {
        rows.shift()
        bump(dropped, name, 1)
        say({ type: 'metrics/dropped', at: clock(), indicator: name, cap: seriesCap, reason: 'seriesCap' })
        emit({ type: 'metrics/dropped', at: clock(), indicator: name, cap: seriesCap, reason: 'seriesCap' })
      }
      series.set(name, rows)
      observedTotal += 1
      if (isSampled) sampledTotal += 1
      say({ type: 'metrics/observed', at: atMs, indicator: name, value, kind: row.kind, sampled: isSampled, by })
      return { ok: true, recorded: true, name, at: atMs, kind: row.kind, sampled: isSampled, sampleRate: row.sampleRate, declared: row.declared, index: rows.length - 1 }
    },

    /** Read-only aggregate over a window (default `vmu.metrics.windowMs`). Provenance (who/when) is included. */
    snapshot(opts = {}) { return computeSnapshot(opts) },

    /** Read-only. Bounded: a `limit` below what is available reports the DROPPED count (never truncates silently). */
    series({ name, limit = seriesCap } = {}) {
      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'series needs an indicator name', 'e.g. { name: "refusalRate", limit: 20 }')
      const cap = Number.isInteger(limit) && limit > 0 ? limit : seriesCap
      const rows = readRows(name, 0)
      const kept = rows.slice(Math.max(0, rows.length - cap))
      return {
        ok: true, name, cap, items: kept.map((r) => Object.assign({}, r)), count: kept.length,
        available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length,
        unavailable: rows.length === 0,
      }
    },

    /** Read-only. Every count carries its grouping dimension (refusals are grouped by VMU_* code, §4.3 #1). */
    counters() { return computeCounters() },

    /** Read-only provenance: the rows that compose a number (indicator) or a refusal count (code). */
    explain({ name = null, code = null } = {}) {
      if (code !== null) {
        const rows = refusalRows.filter((r) => r.code === code)
        return { ok: true, kind: 'refusals', code, count: refusalCounts.get(code) || 0, rows: rows.map((r) => Object.assign({}, r)), available: rows.length, dropped: droppedRows.n, at: clock() }
      }
      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'explain needs an indicator name or a refusal code', 'e.g. { name: "throughput" } or { code: "VMU_INVALID_ARGUMENT" }')
      const rows = readRows(name, 0)
      return {
        ok: true, kind: 'indicator', name, count: rows.length,
        rows: rows.map((r) => Object.assign({}, r)),
        by: [...new Set(rows.map((r) => r.by).filter((x) => x !== null && x !== undefined))].sort(),
        firstAt: rows.length ? rows[0].at : null, lastAt: rows.length ? rows[rows.length - 1].at : null,
        dropped: dropped.get(name) || 0, at: clock(),
        note: 'each row names WHO recorded it (`by`) and WHEN (`at`) — docs/21 §15.2 #1',
      }
    },

    /**
     * Read-only KPI evaluation (docs/21 §4.2): a KPI is "within a window the indicator is ≥/≤ a value",
     * and it is THREE-VALUED: no samples ⇒ `met:null` (undecided) rather than a silent pass/fail.
     * Evaluating a KPI never fires anything — firing is `trigger()`, which is refused by default.
     */
    kpi({ name, op = '<=', target = null, agg = 'avg', window = null } = {}) {
      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'kpi needs an indicator name', 'e.g. { name: "refusalRate", op: "<=", target: 0.1 }')
      if (!['<=', '<', '>=', '>', '=='].includes(String(op))) throw deny('VMU_INVALID_ARGUMENT', 'unsupported kpi operator: ' + String(op), 'use one of <=, <, >=, >, ==')
      if (typeof target !== 'number' || !Number.isFinite(target)) throw deny('VMU_INVALID_ARGUMENT', 'kpi needs a finite numeric target', 'a KPI must be decidable: "indicator op value" (docs/21 §4.2)')
      if (!['avg', 'sum', 'max', 'min', 'last', 'count'].includes(String(agg))) throw deny('VMU_INVALID_ARGUMENT', 'unsupported kpi aggregate: ' + String(agg), 'use avg | sum | max | min | last | count')
      const win = window === null || window === undefined ? windowSetting : (Number.isInteger(window) && window >= 0 ? window : windowSetting)
      const rows = readRows(name, win)
      if (rows.length === 0) return { ok: true, name, op: String(op), target, agg: String(agg), window: win, actual: null, samples: 0, met: null, reason: 'no samples in window (undecided, not a silent pass)', at: clock() }
      const values = rows.map((r) => r.value)
      let actual
      if (agg === 'sum') actual = values.reduce((a, b) => a + b, 0)
      else if (agg === 'max') actual = Math.max(...values)
      else if (agg === 'min') actual = Math.min(...values)
      else if (agg === 'last') actual = values[values.length - 1]
      else if (agg === 'count') actual = values.length
      else actual = values.reduce((a, b) => a + b, 0) / values.length
      actual = Number(actual.toFixed(6))
      const met = op === '<=' ? actual <= target : op === '<' ? actual < target : op === '>=' ? actual >= target : op === '>' ? actual > target : actual === target
      return { ok: true, name, op: String(op), target, agg: String(agg), window: win, actual, samples: values.length, met, at: clock(), note: 'decidable KPI over the injected clock window (docs/21 §4.2)' }
    },

    /**
     * Report a WIRING GAP so it is COUNTED instead of being invisible (docs/21 §4.3 #3: every "not wired"
     * must be counted — e.g. the hooks that have no producer, §6.4). Reporting is not a refusal: it records.
     */
    noteUnwired({ name, reason = 'not wired' } = {}) {
      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'noteUnwired needs a non-empty name', 'e.g. { name: "hook:budget/exceeded", reason: "no producer" }')
      bump(unwired, name, 1)
      say({ type: 'metrics/unwired', at: clock(), name, reason: String(reason) })
      return { ok: true, name, reason: String(reason), count: unwired.get(name) }
    },

    /**
     * A trigger is the ONLY action-shaped call of this module, and it is refused BY NAME unless declared
     * (`vmu.metrics.allowTrigger`). Even when allowed it only emits an advisory hook — metrics never mutate state.
     */
    trigger({ name, payload = null } = {}) {      if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'trigger needs an action name', 'e.g. { name: "kpi/slo-breach", payload: {...} }')
      if (!allowTrigger) {
        throw deny(TRIGGER_CODE, 'metrics are read-only: trigger "' + name + '" is refused',
          'set vmu.metrics.allowTrigger=true only if a KPI must fire a hook; metrics never mutate state (docs/21 §4)')
      }
      const hook = { type: 'metrics/trigger', at: clock(), name, payload: payload && typeof payload === 'object' ? Object.assign({}, payload) : null }
      emit(hook)
      say(hook)
      return { ok: true, triggered: true, name, hook: Object.assign({}, hook), note: 'advisory hook only — no state was mutated' }
    },

    /** Read-only export: 'json' (snapshot + counters) or 'jsonl' (one row per line). Unknown ⇒ named refusal. */
    export({ format = null } = {}) {
      const fmt = format === null ? exportFormat : format
      if (fmt !== 'json' && fmt !== 'jsonl') throw deny('VMU_INVALID_ARGUMENT', 'unsupported export format: ' + String(fmt), 'use "json" or "jsonl" (vmu.metrics.exportFormat)')
      if (fmt === 'jsonl') {
        const lines = []
        for (const name of [...series.keys()].sort()) for (const r of series.get(name)) lines.push(JSON.stringify(r))
        return { ok: true, format: 'jsonl', body: lines.join('\n'), lines: lines.length, dropped: objOf(dropped), at: clock() }
      }
      return { ok: true, format: 'json', body: JSON.stringify({ snapshot: computeSnapshot(), counters: computeCounters() }), dropped: objOf(dropped), at: clock() }
    },

    /** Read-only self-report (docs/21 §5): what is configured, what is capped, what was sampled/dropped. */
    status() {
      return {
        ok: true,
        configured,
        indicators: configured ? declared.slice() : [],
        catalogue: METRIC_CATALOGUE.slice(),
        windowMs: windowSetting,
        allowTrigger,
        exportFormat,
        seriesCap,
        sampling: sampleRequested
          ? { enabled: true, rate: sampleRate, stride, neverSampledKinds: NEVER_SAMPLED_KINDS.slice() }
          : { enabled: false, rate: 0, neverSampledKinds: NEVER_SAMPLED_KINDS.slice() },
        observedTotal,
        sampledTotal,
        droppedTotal: dropTotal(),
        sampledOutTotal: sumOf(sampledOut),
        unwiredTotal: sumOf(unwired),
        refusalsTotal: sumOf(refusalCounts),
        skippedTotal: Object.values(skips).reduce((a, b) => a + b, 0),
        at: clock(),
        note: 'counting surface for the judgement layer: nothing is dropped silently, every count is explainable, sampling self-discloses',
      }
    },
  }
}
