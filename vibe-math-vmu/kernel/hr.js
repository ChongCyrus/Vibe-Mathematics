// vmu kernel hr — 人事面（招聘周期/绩效/终身教职/申诉/离任/轮换）。
//
// 与 members（角色席位）**分层**：本面是**人事规则**（22 卷 `vmu.hr.*`）。
// 标准＝mathtools（已验收）：每键**改变可观测行为**；`enforced[]`／`fired[]`／`enforcedScope`；
// 每个拒绝带数组型 `enforced` ＋ 口径 ＋ `wouldEvaluate ⊇ enforced`；未接**逐个点名**；注入时钟；零机制不崩。
//
// 码＝**零新码**：只用 03-§8／22 卷已登记的 7 个 `VMU_HR_*`。
// ⚠ 任务书点名的"合同到期／工时超限／休假余额／重叠合同／资质过期／试用期超长"在 22 卷**既无键也无码** ⇒
//   本模块**不实现**（见 UNSUPPORTED_SEMANTICS 逐条点名），需先立键立码（提案，不自造 ✗）。
export const apiVersion = 1
// task-234: the instant→ms rule is the SHARED one (kernel/timevalue.js), aliased because this module already
// has a local `ms` for "days → milliseconds". Numbers stay numbers (0/1000 are instants, never years).
import { ms as toMs } from './timevalue.js'
export const ENFORCED_SCOPE = 'evaluated-so-far'

/** 已接线的 11 个键（**字面量**读取 ⇒ 设置表/文档审计按文本扫描即可发现 ✓）。 */
export const WIRED_KEYS = Object.freeze([
  'vmu.hr.recruitCycleDays',
  'vmu.hr.recruitWindowOpenMs',
  'vmu.hr.performanceCadenceDays',
  'vmu.hr.performanceEvidenceRequired',
  'vmu.hr.tenureTrackMonths',
  'vmu.hr.tenureDecisionWindowDays',
  'vmu.hr.tenureQuorum',
  'vmu.hr.appealWindowDays',
  'vmu.hr.offboardingChecklist',
  'vmu.hr.rotationPolicy',
  'vmu.hr.humanDecisionRequired',
])

/** 任务书要求但**无键无码**的语义 ⇒ 逐个点名（不算"未接键"，因为连键都不存在 ✓）。 */
export const UNSUPPORTED_SEMANTICS = Object.freeze({
  contractExpiry: '合同到期：22 卷无 vmu.hr.contract* 键、03-§8 无对应码 ⇒ 需先立键立码（提案）',
  timesheetCap: '工时超上限：无 vmu.hr.timesheet* 键/码 ⇒ 提案',
  leaveBalance: '休假余额：无 vmu.hr.leave* 键/码 ⇒ 提案',
  overlappingContracts: '重叠合同：无键/码 ⇒ 提案',
  qualificationExpiry: '资质过期：无键/码 ⇒ 提案',
  probationTooLong: '试用期超长：无键/码 ⇒ 提案',
})

/** 每个 op **可能**求值的键集（照 records.js OP_WOULD）⇒ 断言 `enforced ⊆ wouldEvaluate`。 */
export const WOULD_EVALUATE = Object.freeze({
  recruit: ['vmu.hr.recruitCycleDays', 'vmu.hr.recruitWindowOpenMs'],
  performance: ['vmu.hr.performanceCadenceDays', 'vmu.hr.performanceEvidenceRequired'],
  tenure: ['vmu.hr.tenureTrackMonths', 'vmu.hr.tenureDecisionWindowDays', 'vmu.hr.tenureQuorum', 'vmu.hr.humanDecisionRequired'],
  appeal: ['vmu.hr.appealWindowDays'],
  offboard: ['vmu.hr.offboardingChecklist'],
  rotation: ['vmu.hr.rotationPolicy'],
})

/** 已登记的 7 个码（本模块**只用**这些）。 */
export const CODES = Object.freeze({
  CYCLE_CLOSED: 'VMU_HR_CYCLE_CLOSED',
  PERF_EVIDENCE_MISSING: 'VMU_HR_PERF_EVIDENCE_MISSING',
  TENURE_DECISION_DUE: 'VMU_HR_TENURE_DECISION_DUE',
  TENURE_QUORUM_MISSING: 'VMU_HR_TENURE_QUORUM_MISSING',
  APPEAL_OPEN: 'VMU_HR_APPEAL_OPEN',
  OFFBOARDING_INCOMPLETE: 'VMU_HR_OFFBOARDING_INCOMPLETE',
  AUTODECISION_FORBIDDEN: 'VMU_HR_AUTODECISION_FORBIDDEN',
})

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra) Object.assign(e, extra)
  return e
}

const raw = (s, k, d) => (s && Object.prototype.hasOwnProperty.call(s, k) ? s[k] : d)
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const boolOf = (v, d) => (v === undefined || v === null ? d : !!v)
const strOf = (v, d) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d)
const listOf = (v, d) => (Array.isArray(v) ? v.slice() : d)
const mark = (list, k) => { if (list.indexOf(k) === -1) list.push(k); return list }
// task-234 (naming): DAYS → milliseconds is a DIFFERENT rule from the shared timevalue `ms()` (instant →
// epoch-ms). Both used to be called `ms` in one file — a reader trap; the shared helper is imported as `toMs`
// and this one is `daysToMs`, so a reader never has to guess which "ms" they are looking at.
const daysToMs = (days) => Math.round(numOf(days, 0) * 86400000)

export function createHr({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createHr needs a clock function', 'pass { clock }')
  const counters = { refusals: {}, ops: {} }
  const audit = []
  const state = { reads: 0, writes: 0 }

  // ── 已接线的 11 键（**字面量**读取 ✓） ──
  const C = {
    recruitCycleDays: numOf(raw(settings, 'vmu.hr.recruitCycleDays', 30), 30),
    recruitWindowOpenMs: numOf(raw(settings, 'vmu.hr.recruitWindowOpenMs', 7 * 86400000), 7 * 86400000),
    performanceCadenceDays: numOf(raw(settings, 'vmu.hr.performanceCadenceDays', 180), 180),
    performanceEvidenceRequired: boolOf(raw(settings, 'vmu.hr.performanceEvidenceRequired', true), true),
    tenureTrackMonths: numOf(raw(settings, 'vmu.hr.tenureTrackMonths', 36), 36),
    tenureDecisionWindowDays: numOf(raw(settings, 'vmu.hr.tenureDecisionWindowDays', 60), 60),
    tenureQuorum: numOf(raw(settings, 'vmu.hr.tenureQuorum', 3), 3),
    appealWindowDays: numOf(raw(settings, 'vmu.hr.appealWindowDays', 14), 14),
    offboardingChecklist: listOf(raw(settings, 'vmu.hr.offboardingChecklist', ['handover', 'keys', 'records']), ['handover', 'keys', 'records']),
    rotationPolicy: strOf(raw(settings, 'vmu.hr.rotationPolicy', 'round-robin'), 'round-robin'),
    humanDecisionRequired: boolOf(raw(settings, 'vmu.hr.humanDecisionRequired', true), true),
  }

  const bump = (code) => { counters.refusals[code] = (counters.refusals[code] || 0) + 1 }
  const say = (rec) => { audit.push(rec); if (audit.length > 200) audit.shift(); if (bus && typeof bus.emit === 'function') { try { bus.emit('record/appended', rec) } catch (e) { log('hr: bus emit failed: ' + String((e && e.code) || e)) } } }
  const check = (op, list) => {
    const would = (WOULD_EVALUATE[op] || []).slice()
    for (const k of (list || [])) if (would.indexOf(k) === -1) throw refuse('VMU_INVALID_ARGUMENT', 'enforced key not declared in WOULD_EVALUATE[' + op + ']: ' + k, 'declare it (records.js OP_WOULD 口径)')
    return would
  }
  /** 拒绝（抛出型）：enforced ＋ 口径 ＋ wouldEvaluate ⊇ enforced。 */
  const deny = (op, code, message, hint, enforced, extra) => {
    const list = (enforced || []).slice()
    const would = check(op, list)
    bump(code); counters.ops[op] = (counters.ops[op] || 0) + 1
    const e = refuse(code, message, hint, Object.assign({ enforced: list, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: would, op }, extra || {}))
    say({ type: 'hr/refused', at: clock(), op, code, enforced: list, enforcedScope: ENFORCED_SCOPE })
    return e
  }
  const ok = (op, enforced, fired, extra) => {
    const list = (enforced || []).slice()
    const would = check(op, list)
    const fl = (fired || []).filter((k) => list.indexOf(k) !== -1)
    counters.ops[op] = (counters.ops[op] || 0) + 1
    state.writes += 1
    return Object.assign({ ok: true, enforced: list, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: would, fired: fl }, extra || {})
  }
  // task-210 (the THIRTEENTH case of the falsy-zero class): epoch 0 is a LEGAL instant, so "not given" is
  // decided EXPLICITLY (`undefined`/`null`) and NEVER by falsiness. `given()` is the single rule for every
  // time/count input in this module, and `at()` falls back to the injected clock only when the instant is
  // really absent.
  //
  // task-234: the instant→ms rule is the SHARED kernel/timevalue.js one (imported as `toMs`, because this
  // factory already has a local `ms` meaning "days → milliseconds" — a different rule, left untouched). The
  // local `num()` was the THIRD copy of the same rule and is deleted: numbers stay numbers, so a bare-year
  // string can never steal the meaning of `0`/`1000` (see timevalue.js for the trap).
  const given = (v) => v !== undefined && v !== null
  const at = (v) => String(given(v) ? v : clock())

  /** recruit：招聘窗口（`recruitWindowOpenMs`）＋周期（`recruitCycleDays`）⇒ 过期即 `VMU_HR_CYCLE_CLOSED`。 */
  function recruit({ openingId = null, openedAt = null, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.recruitCycleDays')
    mark(enforced, 'vmu.hr.recruitWindowOpenMs')
    if (!given(openedAt)) throw deny('recruit', 'VMU_INVALID_ARGUMENT', 'recruit needs { openedAt }', 'pass the opening instant (epoch 0 is a legal instant)', enforced)
    const t = toMs(given(when) ? when : clock()), o = toMs(openedAt)
    if (!Number.isFinite(t) || !Number.isFinite(o)) throw deny('recruit', 'VMU_INVALID_ARGUMENT', 'recruit needs ISO instants', 'pass ISO strings, or a finite millisecond number (0 is legal)', enforced)
    const closesAt = o + C.recruitWindowOpenMs
    if (t > closesAt) throw deny('recruit', CODES.CYCLE_CLOSED, 'the recruitment cycle is CLOSED: window closed at ' + new Date(closesAt).toISOString() + ' (cycle ' + C.recruitCycleDays + 'd)', 'open a new cycle (vmu.hr.recruitCycleDays=' + C.recruitCycleDays + ')', enforced, { openingId: openingId ? String(openingId) : null, closesAt: new Date(closesAt).toISOString(), at: at(when) })
    return ok('recruit', enforced, enforced.slice(), { openingId: openingId ? String(openingId) : null, openedAt: o, closesAt: new Date(closesAt).toISOString(), cycleDays: C.recruitCycleDays, at: at(when) })
  }

  /** performance：绩效节奏（`performanceCadenceDays`）＋证据要求 ⇒ 缺证据 `VMU_HR_PERF_EVIDENCE_MISSING`。 */
  function performance({ who = null, lastAt = null, evidence = null, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.performanceCadenceDays')
    if (!who) throw deny('performance', 'VMU_INVALID_ARGUMENT', 'performance needs { who }', 'pass the member id', enforced)
    const t = toMs(given(when) ? when : clock()), l = given(lastAt) ? toMs(lastAt) : t
    if (!Number.isFinite(t) || !Number.isFinite(l)) throw deny('performance', 'VMU_INVALID_ARGUMENT', 'performance needs ISO instants', 'pass ISO strings', enforced)
    if (t - l > daysToMs(C.performanceCadenceDays)) {
      throw deny('performance', CODES.CYCLE_CLOSED, 'the performance cycle is overdue for ' + String(who) + ': last=' + new Date(l).toISOString() + ' cadence=' + C.performanceCadenceDays + 'd', 'close the cycle (cadence ' + C.performanceCadenceDays + 'd)', enforced, { who: String(who), lastAt: new Date(l).toISOString(), cadenceDays: C.performanceCadenceDays, at: at(when) })
    }
    if (C.performanceEvidenceRequired) {
      mark(enforced, 'vmu.hr.performanceEvidenceRequired')
      if (!(evidence && evidence.length)) throw deny('performance', CODES.PERF_EVIDENCE_MISSING, 'performance evidence is required but missing for ' + String(who), 'attach evidence (vmu.hr.performanceEvidenceRequired=true)', enforced, { who: String(who), at: at(when) })
    }
    return ok('performance', enforced, enforced.slice(), { who: String(who), cadenceDays: C.performanceCadenceDays, evidence: (evidence || []).length, at: at(when) })
  }

  /** tenure：终身教职（轨道月数／决定窗口／法定人数／人类决策）⇒ 四个已登记码。 */
  function tenure({ who = null, trackStart = null, decisionAt = null, votes = 0, auto = false, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.tenureTrackMonths')
    if (!who) throw deny('tenure', 'VMU_INVALID_ARGUMENT', 'tenure needs { who }', 'pass the member id', enforced)
    if (C.humanDecisionRequired && auto === true) {
      mark(enforced, 'vmu.hr.humanDecisionRequired')
      throw deny('tenure', CODES.AUTODECISION_FORBIDDEN, 'an automatic tenure decision is FORBIDDEN for ' + String(who), 'a human must decide (vmu.hr.humanDecisionRequired=true)', enforced, { who: String(who), at: at(when) })
    }
    mark(enforced, 'vmu.hr.tenureQuorum')
    if (Number(votes) < C.tenureQuorum) throw deny('tenure', CODES.TENURE_QUORUM_MISSING, 'the tenure quorum is not met for ' + String(who) + ': votes=' + Number(votes) + ' < quorum=' + C.tenureQuorum, 'collect at least ' + C.tenureQuorum + ' votes', enforced, { who: String(who), votes: Number(votes), quorum: C.tenureQuorum, at: at(when) })
    if (!given(trackStart)) throw deny('tenure', 'VMU_INVALID_ARGUMENT', 'tenure needs { trackStart }', 'pass the track start instant (epoch 0 is a legal instant)', enforced)
    const s = toMs(trackStart), t = toMs(given(when) ? when : clock())
    const trackEnd = s + C.tenureTrackMonths * 30 * 86400000
    const due = trackEnd + daysToMs(C.tenureDecisionWindowDays)
    if (t > due && !given(decisionAt)) {
      mark(enforced, 'vmu.hr.tenureDecisionWindowDays')
      throw deny('tenure', CODES.TENURE_DECISION_DUE, 'the tenure decision is DUE for ' + String(who) + ': track ended ' + new Date(trackEnd).toISOString() + ', window ' + C.tenureDecisionWindowDays + 'd, now ' + at(given(when) ? when : clock()), 'record the decision (window ' + C.tenureDecisionWindowDays + 'd)', enforced, { who: String(who), trackEnd: new Date(trackEnd).toISOString(), dueAt: new Date(due).toISOString(), at: at(when) })
    }
    return ok('tenure', enforced, enforced.slice(), { who: String(who), votes: Number(votes), quorum: C.tenureQuorum, trackMonths: C.tenureTrackMonths, at: at(when) })
  }

  /** appeal：申诉（`appealWindowDays`）⇒ 窗口内可提；存在未决申诉 ⇒ `VMU_HR_APPEAL_OPEN`（挡住自动推进）。 */
  function appeal({ who = null, openedAt = null, resolved = false, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.appealWindowDays')
    if (!who) throw deny('appeal', 'VMU_INVALID_ARGUMENT', 'appeal needs { who }', 'pass the member id', enforced)
    if (given(openedAt) && resolved !== true) {
      throw deny('appeal', CODES.APPEAL_OPEN, 'an appeal is OPEN for ' + String(who) + ' (opened ' + String(openedAt) + ')', 'resolve the appeal before any automatic decision', enforced, { who: String(who), openedAt: String(openedAt), at: at(when) })
    }
    if (given(openedAt)) {
      const o = toMs(openedAt), t = toMs(given(when) ? when : clock())
      if (Number.isFinite(o) && Number.isFinite(t) && t - o > daysToMs(C.appealWindowDays)) {
        throw deny('appeal', CODES.APPEAL_OPEN, 'the appeal window has CLOSED for ' + String(who) + ': opened ' + String(openedAt) + ' window=' + C.appealWindowDays + 'd', 'the appeal can no longer be filed (window ' + C.appealWindowDays + 'd)', enforced, { who: String(who), windowDays: C.appealWindowDays, at: at(when) })
      }
    }
    return ok('appeal', enforced, [], { who: String(who), windowDays: C.appealWindowDays, at: at(when) })
  }

  /** offboard：离任清单（`offboardingChecklist`）⇒ 缺项即 `VMU_HR_OFFBOARDING_INCOMPLETE`（点名缺项）。 */
  function offboard({ who = null, done = null, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.offboardingChecklist')
    if (!who) throw deny('offboard', 'VMU_INVALID_ARGUMENT', 'offboard needs { who }', 'pass the member id', enforced)
    const have = Array.isArray(done) ? done.map(String) : []
    const missing = C.offboardingChecklist.filter((k) => have.indexOf(k) === -1)
    if (missing.length) throw deny('offboard', CODES.OFFBOARDING_INCOMPLETE, 'offboarding is incomplete for ' + String(who) + ': missing ' + missing.join(', '), 'complete every checklist item (' + C.offboardingChecklist.join('/') + ')', enforced, { who: String(who), missing, at: at(when) })
    return ok('offboard', enforced, enforced.slice(), { who: String(who), checklist: C.offboardingChecklist.length, at: at(when) })
  }

  /** rotation：轮换策略（`rotationPolicy`）进回执 ⇒ 键**改变可观测行为**（消费方按 mode 轮换）。 */
  function rotation({ pool = null, at: when = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.hr.rotationPolicy')
    const p = Array.isArray(pool) ? pool.map(String) : []
    return ok('rotation', enforced, [], { mode: C.rotationPolicy, pool: p.length, next: p.length ? p[0] : null, at: at(when) })
  }

  /** status：只读（11 键接线 ＋ 无未接键 ＋ 不支持语义逐个点名 ＋ 计数）。 */
  function status() {
    state.reads += 1
    return {
      ok: true, apiVersion, enforcedScope: ENFORCED_SCOPE,
      wired: WIRED_KEYS.slice(), planned: [], plannedReasons: {},
      unsupportedSemantics: Object.assign({}, UNSUPPORTED_SEMANTICS),
      partition: { wired: WIRED_KEYS.length, planned: 0, total: WIRED_KEYS.length },
      codes: Object.assign({}, CODES),
      policy: {
        recruitCycleDays: C.recruitCycleDays, recruitWindowOpenMs: C.recruitWindowOpenMs,
        performanceCadenceDays: C.performanceCadenceDays, performanceEvidenceRequired: C.performanceEvidenceRequired,
        tenureTrackMonths: C.tenureTrackMonths, tenureDecisionWindowDays: C.tenureDecisionWindowDays,
        tenureQuorum: C.tenureQuorum, appealWindowDays: C.appealWindowDays,
        offboardingChecklist: C.offboardingChecklist.slice(), rotationPolicy: C.rotationPolicy,
        humanDecisionRequired: C.humanDecisionRequired,
      },
      wouldEvaluate: JSON.parse(JSON.stringify(WOULD_EVALUATE)),
      counts: { refusals: Object.assign({}, counters.refusals), ops: Object.assign({}, counters.ops), reads: state.reads, writes: state.writes },
      auditTail: audit.slice(-5),
      mechanism: { hasBus: !!bus, clockInjected: true, zeroMechanismSafe: true },
    }
  }

  return { recruit, performance, tenure, appeal, offboard, rotation, status }
}
