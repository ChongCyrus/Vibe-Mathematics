// vmu kernel · capacity — the INFRASTRUCTURE capacity face (docs/20, docs/22): seats, machine-hours,
// facilities, storage headroom, waitlists, preemption and forecasting.
//
// WHAT IT IS NOT: seats are not ROLES (that belongs to the members/role face) and quotas are not the generic
// budget registry (`kernel/budget.js`). This face owns the declared `vmu.capacity.*` rules only.
//
// THE ACCEPTED FACE CONVENTIONS (mathtools / conference / funding / storepolicy):
//   ② every receipt carries `enforced[]` (keys EVALUATED for that call) + `fired[]` (keys that CHANGED its
//      outcome, `fired ⊆ enforced`) + `enforcedScope:'evaluated-so-far'`;
//   ③ every REFUSAL — this face RETURNS them — carries an ARRAY `enforced` (possibly empty, never undefined),
//      the same scope, and `wouldEvaluate ⊇ enforced`;
//   ④ a declared key that is not wired is named in `status().plannedKeys` with its reason;
//   refusals are counted PER CODE; the injected clock is the only time source; reads never mutate.
//
// Codes (ALL already registered in 03-§8 — nothing is invented here): VMU_CAPACITY_EXHAUSTED ·
// VMU_CAPACITY_POOL_LOW · VMU_CAPACITY_PREEMPTED · VMU_CAPACITY_FACILITY_CONFLICT · VMU_CAPACITY_STORAGE_WARN ·
// VMU_CAPACITY_FORECAST_STALE · VMU_QUOTA_EXCEEDED · VMU_NOT_PERMITTED · VMU_STATE · VMU_NO_SUCH_OBJECT ·
// VMU_INVALID_ARGUMENT
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apiVersion = 1
export const ENFORCED_SCOPE = 'evaluated-so-far'
const DAY_MS = 86400000

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 12 declared keys this face wires (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze([
  'vmu.capacity.seatsPerDomain', 'vmu.capacity.machineHoursPool', 'vmu.capacity.overcommitRatio',
  'vmu.capacity.allocationPolicy', 'vmu.capacity.waitlistMax', 'vmu.capacity.preemptPolicy',
  'vmu.capacity.facilities', 'vmu.capacity.safetyBriefingRequired', 'vmu.capacity.storageWarnRatio',
  'vmu.capacity.forecastHorizonDays', 'vmu.capacity.forecastStaleDays', 'vmu.capacity.cleanupCadenceDays',
])

/** Why a declared-but-unwired key would not be honoured (kept for future declarations). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.capacity': '尚未接线：本面只覆盖 20/22 卷声明的 12 条容量旋钮；新声明的键需要一个语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])
const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const uniq = (v) => [...new Set(Array.isArray(v) ? v : [])]
const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }
const markAll = (list, keys) => { for (const k of keys) mark(list, k); return list }

const DEFAULTS = Object.freeze({
  'vmu.capacity.seatsPerDomain': 0, 'vmu.capacity.machineHoursPool': 0, 'vmu.capacity.overcommitRatio': 1,
  'vmu.capacity.allocationPolicy': 'strict', 'vmu.capacity.waitlistMax': 0, 'vmu.capacity.preemptPolicy': 'never',
  'vmu.capacity.facilities': [], 'vmu.capacity.safetyBriefingRequired': false, 'vmu.capacity.storageWarnRatio': 0.9,
  'vmu.capacity.forecastHorizonDays': 30, 'vmu.capacity.forecastStaleDays': 7, 'vmu.capacity.cleanupCadenceDays': 0,
})
const POLICIES = Object.freeze(['strict', 'waitlist', 'preempt'])
const PREEMPT_POLICIES = Object.freeze(['never', 'lower-priority', 'always'])

/** 3 ready-made (settings, call) pairs for the C2 gate scenarios (tests/audit-enforced-consistency). */
export const GATE_SCENARIOS = Object.freeze([
  { name: 'capacity.reserve(pool)', settings: { 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.overcommitRatio': 1 }, call: { op: 'reserve', args: { domain: 'd1', hours: 20 } } },
  { name: 'capacity.reserve(reserve-touched)', settings: { 'vmu.capacity.machineHoursPool': 100, 'vmu.capacity.overcommitRatio': 0.5 }, call: { op: 'reserve', args: { domain: 'd1', hours: 80 } } },
  { name: 'capacity.forecast(horizon)', settings: { 'vmu.capacity.forecastHorizonDays': 3 }, call: { op: 'forecast', args: { days: 10 } } },
])

export function createCapacity({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') {
    return { ok: false, code: 'VMU_INVALID_ARGUMENT', message: 'createCapacity needs a clock function', hint: 'pass { clock: () => ms }',
      enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE, wouldEvaluate: [] }
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* advisory */ } } }
  const emit = (ev) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(ev) } catch (e) { /* advisory */ } } }

  const K = {
    seatsPerDomain: intOr(sget('vmu.capacity.seatsPerDomain'), 0),
    pool: intOr(sget('vmu.capacity.machineHoursPool'), 0),
    ratio: Math.max(0, numOr(sget('vmu.capacity.overcommitRatio'), 1)),
    policy: POLICIES.includes(sget('vmu.capacity.allocationPolicy')) ? sget('vmu.capacity.allocationPolicy') : 'strict',
    waitlistMax: intOr(sget('vmu.capacity.waitlistMax'), 0),
    preemptPolicy: PREEMPT_POLICIES.includes(sget('vmu.capacity.preemptPolicy')) ? sget('vmu.capacity.preemptPolicy') : 'never',
    facilities: listOr(sget('vmu.capacity.facilities')),
    safetyBriefing: sget('vmu.capacity.safetyBriefingRequired') === true,
    storageWarnRatio: Math.max(0, numOr(sget('vmu.capacity.storageWarnRatio'), 0.9)),
    horizonDays: intOr(sget('vmu.capacity.forecastHorizonDays'), 30),
    staleDays: intOr(sget('vmu.capacity.forecastStaleDays'), 7),
    cadenceDays: intOr(sget('vmu.capacity.cleanupCadenceDays'), 0),
  }
  /** usable = the pool × the overcommit/reserve ratio; ceiling = how far the pool may be overcommitted. */
  const usableOf = () => Math.floor(K.pool * (K.ratio > 0 ? K.ratio : 0))
  const ceilingOf = () => (K.ratio >= 1 ? Math.floor(K.pool * K.ratio) : K.pool)

  const counters = { reservations: 0, released: 0, preempted: 0, waitlisted: 0, refused: 0, poolLowWarnings: 0, storageWarnings: 0, forecasts: 0, staleForecasts: 0 }
  const refusals = new Map()
  const reservations = new Map()      // id -> reservation
  const waitlist = []
  const lastRelease = new Map()       // domain -> at
  const receiptRing = []
  const ringDropped = { n: 0 }

  /** RETURN-TYPE refusal: array `enforced` + scope + `wouldEvaluate ⊇ enforced` (never undefined). */
  const deny = (code, message, hint, enforced = [], extra = null, fired = []) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    const firedKeys = uniq(Array.isArray(fired) ? fired : []).filter((k) => list.includes(k))
    say({ type: 'capacity/refused', at: clock(), code, message, enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    return Object.assign({ ok: false, code, message, hint: hint || null, at: clock() },
      { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: list.slice() }, extra || {})
  }
  const receipt = (obj, enforced, fired) => {
    const list = uniq(enforced)
    const firedKeys = uniq(fired).filter((k) => list.includes(k))
    const r = Object.assign({ ok: true, at: clock() }, obj, { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    receiptRing.push(r)
    while (receiptRing.length > 200) { receiptRing.shift(); ringDropped.n += 1 }
    return r
  }
  const domainUsage = (domain) => [...reservations.values()].filter((r) => r.domain === domain && r.active).reduce((a, r) => a + r.seats, 0)
  const hoursUsed = () => [...reservations.values()].filter((r) => r.active).reduce((a, r) => a + r.hours, 0)

  const api = {
    apiVersion, WIRED_KEYS, UNWIRED_REASONS, ENFORCED_SCOPE, GATE_SCENARIOS, POLICIES, PREEMPT_POLICIES,

    /**
     * Reserve capacity. Rails, in evaluation order: `facilities` (declared set + double booking),
     * `safetyBriefingRequired`, `cleanupCadenceDays` (cooldown), `seatsPerDomain` (with `allocationPolicy`
     * and `waitlistMax`), `machineHoursPool` × `overcommitRatio` (reserve warn vs hard ceiling, with
     * `preemptPolicy` for the preemption branch) and `storageWarnRatio` (soft warning).
     */
    reserve({ domain = null, seats = 0, hours = 0, facility = null, fromMs = null, toMs = null,
      safetyBriefing = false, priority = 0, storageRatio = null, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.capacity.facilities', 'vmu.capacity.safetyBriefingRequired', 'vmu.capacity.cleanupCadenceDays',
        'vmu.capacity.seatsPerDomain', 'vmu.capacity.allocationPolicy', 'vmu.capacity.waitlistMax',
        'vmu.capacity.machineHoursPool', 'vmu.capacity.overcommitRatio', 'vmu.capacity.preemptPolicy', 'vmu.capacity.storageWarnRatio'])
      const fired = []
      const now = at === null ? clock() : at
      const warnings = []
      const preempted = []
      if (!(typeof domain === 'string' && domain)) {
        return deny('VMU_INVALID_ARGUMENT', 'a reservation needs a domain', 'pass { domain }', enforced, null, fired)
      }
      // ① facilities: declared set + no overlapping double booking
      if (facility !== null) {
        const f = String(facility)
        if (K.facilities.length && !K.facilities.includes(f)) {
          mark(fired, 'vmu.capacity.facilities')
          return deny('VMU_CAPACITY_FACILITY_CONFLICT', 'facility "' + f + '" is not declared',
            'declared: ' + (K.facilities.join(', ') || '(none)') + ' (vmu.capacity.facilities)', enforced, { facility: f }, fired)
        }
        const clash = [...reservations.values()].find((r) => r.active && r.facility === f
          && (fromMs === null || r.toMs === null || (fromMs < r.toMs && (toMs === null || toMs > r.fromMs))))
        if (clash) {
          mark(fired, 'vmu.capacity.facilities')
          return deny('VMU_CAPACITY_FACILITY_CONFLICT', 'facility "' + f + '" is already booked',
            'conflicting reservation: ' + clash.id + ' (domain ' + clash.domain + ') — vmu.capacity.facilities', enforced, { facility: f, conflicting: clash.id }, fired)
        }
      }
      // ② safety briefing
      mark(fired, 'vmu.capacity.safetyBriefingRequired')
      if (K.safetyBriefing && facility !== null && safetyBriefing !== true) {
        return deny('VMU_NOT_PERMITTED', 'vmu.capacity.safetyBriefingRequired=true: a facility booking needs the safety briefing',
          'pass { safetyBriefing: true } for facility "' + String(facility) + '"', enforced, { facility: String(facility) }, fired)
      }
      // ③ cooldown (cleanupCadenceDays)
      const last = lastRelease.get(domain)
      if (K.cadenceDays > 0 && last !== undefined) {
        mark(fired, 'vmu.capacity.cleanupCadenceDays')
        const until = last + K.cadenceDays * DAY_MS
        if (now < until) {
          return deny('VMU_STATE', 'domain ' + domain + ' is in its cleanup cooldown',
            '剩余=' + (until - now) + 'ms (vmu.capacity.cleanupCadenceDays=' + K.cadenceDays + ' days; since ' + last + ')',
            enforced, { cooldownRemainingMs: until - now, cooldownUntil: until }, fired)
        }
      }
      // ④ seats per domain (+ allocationPolicy / waitlistMax)
      if (K.seatsPerDomain > 0 && seats > 0) {
        mark(fired, 'vmu.capacity.seatsPerDomain')
        const used = domainUsage(domain)
        if (used + seats > K.seatsPerDomain) {
          if (K.policy === 'waitlist') {
            mark(fired, 'vmu.capacity.allocationPolicy')
            mark(fired, 'vmu.capacity.waitlistMax')
            if (waitlist.length >= K.waitlistMax) {
              return deny('VMU_QUOTA_EXCEEDED', 'the waitlist is full: ' + waitlist.length + '/' + K.waitlistMax,
                '现值=' + waitlist.length + ', 上限=' + K.waitlistMax + ' (vmu.capacity.waitlistMax)', enforced, { waitlist: waitlist.length }, fired)
            }
            const entry = { domain, seats, hours, facility, fromMs, toMs, priority, queuedAt: now }
            waitlist.push(entry)
            counters.waitlisted += 1
            return receipt({ action: 'reserve', domain, waitlisted: true, waitlistPosition: waitlist.length, waitlistMax: K.waitlistMax,
              requested: { seats, hours }, limits: { seatsPerDomain: K.seatsPerDomain, used } }, enforced, fired)
          }
          return deny('VMU_CAPACITY_EXHAUSTED', 'the domain seat cap is reached for ' + domain + ': ' + (used + seats) + ' > ' + K.seatsPerDomain,
            '现值=' + (used + seats) + ', 上限=' + K.seatsPerDomain + ' (vmu.capacity.seatsPerDomain)', enforced, { used, cap: K.seatsPerDomain }, fired)
        }
      }
      // ⑤ machine hours: reserve warn → hard ceiling → preemption
      if (K.pool > 0 && hours > 0) {
        mark(fired, 'vmu.capacity.machineHoursPool')
        const used = hoursUsed()
        const usable = usableOf()
        const ceiling = ceilingOf()
        const next = used + hours
        if (next > usable && next <= ceiling && K.ratio < 1) {
          // the declared reserve is being eaten: WARN AND SELF-DISCLOSE (never silent)
          mark(fired, 'vmu.capacity.overcommitRatio')
          warnings.push({ code: 'VMU_CAPACITY_POOL_LOW', message: 'the reservation touches the reserve: ' + next + ' > ' + usable,
            hint: '现值=' + next + ', 保留上限=' + usable + ' (vmu.capacity.overcommitRatio=' + K.ratio + ')' })
          counters.poolLowWarnings += 1
        } else if (next > ceiling) {
          mark(fired, 'vmu.capacity.overcommitRatio')
          // THE ALLOCATION POLICY GOVERNS "FULL", wherever fullness appears (seats OR the pool):
          // waitlist ⇒ queue (bounded by waitlistMax), preempt ⇒ take from lower priority, strict ⇒ refuse.
          if (K.policy === 'waitlist') {
            mark(fired, 'vmu.capacity.allocationPolicy')
            mark(fired, 'vmu.capacity.waitlistMax')
            if (waitlist.length >= K.waitlistMax) {
              return deny('VMU_QUOTA_EXCEEDED', 'the waitlist is full: ' + waitlist.length + '/' + K.waitlistMax,
                '现值=' + waitlist.length + ', 上限=' + K.waitlistMax + ' (vmu.capacity.waitlistMax)', enforced, { waitlist: waitlist.length, reason: 'pool' }, fired)
            }
            waitlist.push({ domain, seats, hours, facility, fromMs, toMs, priority, queuedAt: now, reason: 'pool' })
            counters.waitlisted += 1
            return receipt({ action: 'reserve', domain, waitlisted: true, waitlistPosition: waitlist.length, waitlistMax: K.waitlistMax,
              waitlistReason: 'machine-hours pool exhausted (' + next + ' > ' + ceiling + ')',
              requested: { seats, hours }, limits: { used, ceiling } }, enforced, fired)
          }
          if (K.policy === 'preempt') {
            mark(fired, 'vmu.capacity.allocationPolicy')
            if (K.preemptPolicy === 'never') {
              return deny('VMU_CAPACITY_EXHAUSTED', 'the machine-hours pool is exhausted and vmu.capacity.preemptPolicy=never',
                '现值=' + next + ', 上限=' + ceiling + ' (vmu.capacity.machineHoursPool × vmu.capacity.overcommitRatio)', enforced, { used, ceiling }, fired)
            }
            // preempt lower-priority reservations until the request fits, NAMING each victim
            const victims = [...reservations.values()].filter((r) => r.active && r.priority < priority)
              .sort((a, b) => (a.priority - b.priority) || (a.startedAt - b.startedAt))
            let freed = 0
            for (const v of victims) {
              if (used - freed + hours <= ceiling) break
              v.active = false
              v.releasedAt = now
              v.preemptedBy = { domain, at: now }
              freed += v.hours
              preempted.push(v.id)
              counters.preempted += 1
            }
            if (used - freed + hours > ceiling) {
              return deny('VMU_CAPACITY_EXHAUSTED', 'the machine-hours pool is exhausted even after preemption: ' + (used - freed + hours) + ' > ' + ceiling,
                '现值=' + (used - freed + hours) + ', 上限=' + ceiling + ' (nothing left to preempt under vmu.capacity.preemptPolicy=' + K.preemptPolicy + ')',
                enforced, { used, ceiling, preempted }, fired)
            }
          } else {
            return deny('VMU_CAPACITY_EXHAUSTED', 'the machine-hours pool is exhausted: ' + next + ' > ' + ceiling,
              '现值=' + next + ', 上限=' + ceiling + ' (vmu.capacity.machineHoursPool=' + K.pool + ' × overcommitRatio=' + K.ratio + ')', enforced, { used, ceiling }, fired)
          }
        }
      }
      // ⑥ storage warning (soft: the reservation still succeeds, but the warning is self-disclosed)
      if (storageRatio !== null) {
        mark(fired, 'vmu.capacity.storageWarnRatio')
        const ratio = numOr(storageRatio, 0)
        if (ratio > K.storageWarnRatio) {
          warnings.push({ code: 'VMU_CAPACITY_STORAGE_WARN', message: 'storage usage ' + ratio + ' exceeds the warn ratio ' + K.storageWarnRatio,
            hint: '现值=' + ratio + ', 阈值=' + K.storageWarnRatio + ' (vmu.capacity.storageWarnRatio)' })
          counters.storageWarnings += 1
        }
      }
      const id = 'r' + (counters.reservations + 1)
      const res = { id, domain, seats: intOr(seats, 0), hours: intOr(hours, 0), facility: facility === null ? null : String(facility),
        fromMs, toMs, priority: intOr(priority, 0), active: true, startedAt: now, releasedAt: null, preemptedBy: null }
      reservations.set(id, res)
      counters.reservations += 1
      const r = receipt({ action: 'reserve', reservation: id, domain, seats: res.seats, hours: res.hours, facility: res.facility,
        warnings, preempted, preemptedCode: preempted.length ? 'VMU_CAPACITY_PREEMPTED' : null,
        limits: { seatsPerDomain: K.seatsPerDomain, usedHours: hoursUsed(), poolUsable: usableOf(), poolCeiling: ceilingOf() },
        policy: K.policy, preemptPolicy: K.preemptPolicy, overcommitRatio: K.ratio }, enforced, fired)
      if (warnings.length) say({ type: 'capacity/warned', at: now, reservation: id, codes: warnings.map((w) => w.code) })
      if (preempted.length) emit({ type: 'capacity/preempted', at: now, reservation: id, preempted })
      return r
    },

    /** Release a reservation (this starts the `cleanupCadenceDays` cooldown for its domain). */
    release({ reservation, at = null } = {}) {
      const enforced = ['vmu.capacity.cleanupCadenceDays']
      const fired = []
      const now = at === null ? clock() : at
      const res = reservations.get(String(reservation))
      if (!res) return deny('VMU_NO_SUCH_OBJECT', 'no such reservation: ' + String(reservation), 'known: ' + ([...reservations.keys()].join(', ') || '(none)'), enforced, null, fired)
      if (!res.active) return deny('VMU_STATE', 'reservation ' + res.id + ' is not active', 'it was released or preempted already', enforced, null, fired)
      res.active = false
      res.releasedAt = now
      lastRelease.set(res.domain, now)
      counters.released += 1
      mark(fired, 'vmu.capacity.cleanupCadenceDays')
      return receipt({ action: 'release', reservation: res.id, domain: res.domain, cooldownUntil: K.cadenceDays > 0 ? now + K.cadenceDays * DAY_MS : null, cadenceDays: K.cadenceDays }, enforced, fired)
    },

    /** Pull the next waitlist entry (FIFO) — the `waitlistMax` rail made observable on the way out too. */
    admit({ at = null } = {}) {
      const enforced = ['vmu.capacity.waitlistMax', 'vmu.capacity.allocationPolicy']
      const fired = []
      const now = at === null ? clock() : at
      if (waitlist.length === 0) return deny('VMU_STATE', 'the waitlist is empty', 'nothing to admit', enforced, null, fired)
      const next = waitlist.shift()
      return this.reserve(Object.assign({}, next, { at: now, _admitted: true }))
    },

    /** Forecast. `forecastHorizonDays` bounds the window; `forecastStaleDays` bounds the input age. */
    forecast({ days = null, dataAgeDays = 0, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.capacity.forecastHorizonDays', 'vmu.capacity.forecastStaleDays'])
      const fired = []
      const now = at === null ? clock() : at
      const span = days === null ? K.horizonDays : intOr(days, 0)
      mark(fired, 'vmu.capacity.forecastHorizonDays')
      if (span > K.horizonDays) {
        counters.staleForecasts += 1
        return deny('VMU_CAPACITY_FORECAST_STALE', 'the forecast window exceeds the declared horizon: ' + span + ' > ' + K.horizonDays,
          '现值=' + span + ' days, 上限=' + K.horizonDays + ' days (vmu.capacity.forecastHorizonDays)', enforced, { days: span }, fired)
      }
      mark(fired, 'vmu.capacity.forecastStaleDays')
      const age = intOr(dataAgeDays, 0)
      if (age > K.staleDays) {
        counters.staleForecasts += 1
        return deny('VMU_CAPACITY_FORECAST_STALE', 'the forecast input is stale: ' + age + ' > ' + K.staleDays + ' days old',
          '现值=' + age + ' days, 上限=' + K.staleDays + ' days (vmu.capacity.forecastStaleDays)', enforced, { dataAgeDays: age }, fired)
      }
      counters.forecasts += 1
      const used = hoursUsed()
      const perDay = span > 0 ? (used / span) : used
      return receipt({ action: 'forecast', horizonDays: K.horizonDays, days: span, dataAgeDays: age,
        usedHours: used, projectedHours: Math.round(perDay * span), pool: K.pool, usable: usableOf(), ceiling: ceilingOf(),
        exhaustionInDays: K.pool > 0 && perDay > 0 ? Math.max(0, Math.floor((ceilingOf() - used) / perDay)) : null }, enforced, fired)
    },

    /** Storage headroom: `storageWarnRatio` warns above the threshold and REFUSES above 100%. */
    storage({ usedBytes = 0, totalBytes = 0, at = null } = {}) {
      const enforced = ['vmu.capacity.storageWarnRatio']
      const fired = []
      const now = at === null ? clock() : at
      const total = numOr(totalBytes, 0)
      if (total <= 0) return deny('VMU_INVALID_ARGUMENT', 'storage needs a positive totalBytes', 'pass { usedBytes, totalBytes }', enforced, null, fired)
      const used = Math.max(0, numOr(usedBytes, 0))
      const ratio = used / total
      mark(fired, 'vmu.capacity.storageWarnRatio')
      if (ratio > 1) {
        counters.storageWarnings += 1
        return deny('VMU_CAPACITY_STORAGE_WARN', 'storage is over capacity: ' + used + '/' + total,
          '现值=' + used + ' bytes, 上限=' + total + ' bytes (vmu.capacity.storageWarnRatio=' + K.storageWarnRatio + ')', enforced, { ratio }, fired)
      }
      const warnings = []
      if (ratio > K.storageWarnRatio) {
        counters.storageWarnings += 1
        warnings.push({ code: 'VMU_CAPACITY_STORAGE_WARN', message: 'storage usage ' + ratio.toFixed(3) + ' > warn ratio ' + K.storageWarnRatio,
          hint: '现值=' + ratio.toFixed(3) + ', 阈值=' + K.storageWarnRatio + ' (vmu.capacity.storageWarnRatio)' })
      }
      return receipt({ action: 'storage', usedBytes: used, totalBytes: total, ratio, warnRatio: K.storageWarnRatio, warnings }, enforced, fired)
    },

    // ── READ-ONLY surfaces (they never mutate) ──────────────────────────────────────────────────────────
    waitlistView() {
      return { ok: true, items: waitlist.map((w) => Object.assign({}, w)), total: waitlist.length, max: K.waitlistMax, enforced: ['vmu.capacity.waitlistMax'], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    list() {
      return {
        ok: true, reservations: [...reservations.values()].map((r) => ({ id: r.id, domain: r.domain, seats: r.seats, hours: r.hours, facility: r.facility, active: r.active, preemptedBy: r.preemptedBy })),
        waitlist: waitlist.length, hoursUsed: hoursUsed(), seatsPerDomain: K.seatsPerDomain, pool: K.pool, usable: usableOf(), ceiling: ceilingOf(),
        enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE,
      }
    },
    receiptsView({ limit = 20 } = {}) {      const n = intOr(limit, 20) || 20
      const kept = receiptRing.slice(-n)
      return { ok: true, items: kept.map((r) => Object.assign({}, r)), total: receiptRing.length, omitted: receiptRing.length - kept.length, ringDropped: ringDropped.n, enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    /** The declared universe (from the generated registry — never guessed) + the wiring self-report. */
    status() {
      const declared = declaredKeys()
      const wired = WIRED_KEYS.slice()
      const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
      return {
        ok: true, apiVersion, wired, wiredCount: wired.length,
        plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
        unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
        declaredCapacityKeys: declared.count,
        overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
        wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
        complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
        keys: keysSnapshot(K),
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        enforcedScope: ENFORCED_SCOPE,
        gateScenarios: GATE_SCENARIOS.map((s) => s.name),
        note: 'every key in `wired` changes an observable result; receipts carry enforced[] + fired[] (fired ⊆ enforced); refusals carry enforced[] + enforcedScope + wouldEvaluate ⊇ enforced; a touched reserve is a CODE-NAMED warning (VMU_CAPACITY_POOL_LOW), never silence',
        at: clock(),
      }
    },
  }

  function declaredKeys() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      if (!existsSync(p)) return { keys: [], count: 0, source: 'unavailable' }
      const text = readFileSync(p, 'utf8')
      const all = [...new Set([...text.matchAll(/key: "(vmu\.capacity\.[^"]+)"/g)].map((m) => m[1]))].sort()
      return { keys: all, count: all.length, source: 'settings/planned.js' }
    } catch (e) { return { keys: [], count: 0, source: 'error:' + String((e && e.message) || e) } }
  }

  return api
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
function keysSnapshot(K) {
  return {
    'vmu.capacity.seatsPerDomain': K.seatsPerDomain, 'vmu.capacity.machineHoursPool': K.pool,
    'vmu.capacity.overcommitRatio': K.ratio, 'vmu.capacity.allocationPolicy': K.policy,
    'vmu.capacity.waitlistMax': K.waitlistMax, 'vmu.capacity.preemptPolicy': K.preemptPolicy,
    'vmu.capacity.facilities': K.facilities, 'vmu.capacity.safetyBriefingRequired': K.safetyBriefing,
    'vmu.capacity.storageWarnRatio': K.storageWarnRatio, 'vmu.capacity.forecastHorizonDays': K.horizonDays,
    'vmu.capacity.forecastStaleDays': K.staleDays, 'vmu.capacity.cleanupCadenceDays': K.cadenceDays,
  }
}
