// vmu kernel compliance — 研究合规面（伦理审批／知情同意／数据保护／COI 申报／受试者数据导出／审计留痕／合规日历）。
//
// 与 domaingate（域名/出口管制）**分层**：本面是**研究合规**；`vmu.compliance.exportControlCheck` 归 domaingate，
// 本面**只引用不重定义**（在 PLANNED_REASONS 里点名）。
//
// 标准＝mathtools（已验收）✓：每键**改变可观测行为**；**`enforced[]`／`fired[]`（fired ⊆ enforced）／
// `enforcedScope`**；**每个拒绝**（抛出型＋返回型）带数组型 `enforced` ＋ 口径 ＋ `wouldEvaluate ⊇ enforced`；
// 未接键**逐个点名**；注入时钟；零机制不崩；只读面纯净。
//
// 码＝**零新码**：全部复用 03-§8 已登记的 7 个 `VMU_COMPLIANCE_*`（含用 `item` 区分的两条"缺审批"）。
import { createHash } from 'node:crypto'
// task-231: the instant→ms rule is a SINGLE source of truth (kernel/timevalue.js) — it used to be duplicated
// here and in domaingate.js. See that module for the bare-year trap: Date.parse('1000') is the YEAR 1000
// (-30610224000000), never NaN, so a number must be handled as a number BEFORE any stringification.
import { ms } from './timevalue.js'

export const apiVersion = 1
export const ENFORCED_SCOPE = 'evaluated-so-far'

/** 本面已接线的键（字面量读取 ⇒ 设置表/文档审计可按文本扫描发现 ✓）。 */
export const WIRED_KEYS = Object.freeze([
  'vmu.compliance.irbRequired',
  'vmu.compliance.requireApprovalGate',
  'vmu.compliance.require',
  'vmu.compliance.conflictOfInterestDisclosure',
  'vmu.compliance.coiScope',
  'vmu.compliance.overdueEscalation',
  'vmu.compliance.redactionPolicy',
  'vmu.compliance.evidenceKind',
  'vmu.compliance.evidenceMembers',
  'vmu.compliance.evidencePackFields',
  'vmu.compliance.auditPrepLeadDays',
  'vmu.compliance.reviewAlertLeadDays',
  'vmu.compliance.prepare',
  'vmu.compliance.calendarDir',
  'vmu.compliance.calendarTemplate',
  'vmu.compliance.domainPacks',
])

/** 未接键 → 理由（**逐个点名** ✗✓）。`exportControlCheck` 归 domaingate 层（只引用）。 */
export const PLANNED_REASONS = Object.freeze({
  'vmu.compliance.exportControlCheck': '归 domaingate 层（域名/出口管制）：本面只引用不重定义',
})
export const PLANNED_KEYS = Object.freeze(Object.keys(PLANNED_REASONS))

/** 每个 op **可能**求值的键集（照 records.js 的 OP_WOULD ✓）⇒ 断言 `enforced ⊆ wouldEvaluate`。 */
export const WOULD_EVALUATE = Object.freeze({
  review: ['vmu.compliance.irbRequired', 'vmu.compliance.requireApprovalGate', 'vmu.compliance.require'],
  retention: ['vmu.compliance.overdueEscalation'],
  coi: ['vmu.compliance.conflictOfInterestDisclosure', 'vmu.compliance.coiScope'],
  exportData: ['vmu.compliance.redactionPolicy'],
  evidence: ['vmu.compliance.evidenceKind', 'vmu.compliance.evidenceMembers', 'vmu.compliance.evidencePackFields'],
  calendar: ['vmu.compliance.auditPrepLeadDays', 'vmu.compliance.reviewAlertLeadDays', 'vmu.compliance.calendarDir', 'vmu.compliance.calendarTemplate'],
  prepare: ['vmu.compliance.prepare', 'vmu.compliance.domainPacks'],
})

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra) Object.assign(e, extra)
  return e
}

/** 单一规则：`0` 是**合法值** ⇒ 时间/计数类入参一律用 `given()`，**禁止** `!x` 判定（裁决 task-216）。 */
const given = (v) => v !== undefined && v !== null
const raw = (settings, key, d) => (settings && Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : d)
const boolOf = (v, d) => (v === undefined || v === null ? d : !!v)
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const strOf = (v, d) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d)
const mark = (list, k) => { if (list.indexOf(k) === -1) list.push(k); return list }
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

export function createCompliance({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createCompliance needs a clock function', 'pass { clock }')
  const counters = { refusals: {}, ops: {} }
  const audit = []
  const state = { reads: 0, writes: 0 }

  // ── 已接线的键（**字面量**读取：设置表/审计靠文本扫描发现"已接线" ✓；H1/hot 语义由设置表负责） ──
  const C = {
    irbRequired: boolOf(raw(settings, 'vmu.compliance.irbRequired', true), true),
    gateRequired: boolOf(raw(settings, 'vmu.compliance.requireApprovalGate', true), true),
    require: strOf(raw(settings, 'vmu.compliance.require', 'irb+consent'), 'irb+consent'),
    coiDisclosure: boolOf(raw(settings, 'vmu.compliance.conflictOfInterestDisclosure', true), true),
    coiScope: strOf(raw(settings, 'vmu.compliance.coiScope', 'members'), 'members'),
    onOverdue: strOf(raw(settings, 'vmu.compliance.overdueEscalation', 'block'), 'block'),
    redaction: strOf(raw(settings, 'vmu.compliance.redactionPolicy', 'required'), 'required'),
    evidenceKind: strOf(raw(settings, 'vmu.compliance.evidenceKind', 'registry'), 'registry'),
    evidenceMembers: strOf(raw(settings, 'vmu.compliance.evidenceMembers', 'all'), 'all'),
    evidenceFields: strOf(raw(settings, 'vmu.compliance.evidencePackFields', 'kind+members+at'), 'kind+members+at'),
    auditPrepLeadDays: numOf(raw(settings, 'vmu.compliance.auditPrepLeadDays', 14), 14),
    reviewAlertLeadDays: numOf(raw(settings, 'vmu.compliance.reviewAlertLeadDays', 7), 7),
    prepare: strOf(raw(settings, 'vmu.compliance.prepare', 'checklist'), 'checklist'),
    calendarDir: strOf(raw(settings, 'vmu.compliance.calendarDir', 'Shared/Compliance'), 'Shared/Compliance'),
    calendarTemplate: strOf(raw(settings, 'vmu.compliance.calendarTemplate', 'audit-checklist'), 'audit-checklist'),
    domainPacks: clone(raw(settings, 'vmu.compliance.domainPacks', [])),
  }

  const bump = (code) => { counters.refusals[code] = (counters.refusals[code] || 0) + 1 }
  const say = (rec) => { audit.push(rec); if (audit.length > 200) audit.shift(); if (bus && typeof bus.emit === 'function') { try { bus.emit('record/appended', rec) } catch (e) { log('compliance: bus emit failed: ' + String((e && e.code) || e)) } } }
  /** 拒绝（抛出型）：数组型 enforced ＋ 口径 ＋ wouldEvaluate（⊇ enforced）。 */
  const deny = (op, code, message, hint, enforced, extra) => {
    const list = Array.isArray(enforced) ? enforced.slice() : []
    const would = (WOULD_EVALUATE[op] || []).slice()
    for (const k of list) if (would.indexOf(k) === -1) throw refuse('VMU_INVALID_ARGUMENT', 'enforced key not declared in WOULD_EVALUATE[' + op + ']: ' + k, 'declare it in WOULD_EVALUATE (records.js OP_WOULD 口径)')
    bump(code); counters.ops[op] = (counters.ops[op] || 0) + 1
    const e = refuse(code, message, hint, Object.assign({ enforced: list, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: would, op }, extra || {}))
    say({ type: 'compliance/refused', at: clock(), op, code, enforced: list, enforcedScope: ENFORCED_SCOPE })
    return e
  }
  /** 回执（返回型 ok）：enforced/fired ＋ 口径；fired ⊆ enforced。 */
  const ok = (op, enforced, fired, extra) => {
    const list = Array.isArray(enforced) ? enforced.slice() : []
    const fl = (Array.isArray(fired) ? fired : []).filter((k) => list.indexOf(k) !== -1)
    const would = (WOULD_EVALUATE[op] || []).slice()
    for (const k of list) if (would.indexOf(k) === -1) throw refuse('VMU_INVALID_ARGUMENT', 'enforced key not declared in WOULD_EVALUATE[' + op + ']: ' + k, 'declare it in WOULD_EVALUATE')
    counters.ops[op] = (counters.ops[op] || 0) + 1
    state.writes += 1
    return Object.assign({ ok: true, enforced: list, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: would, fired: fl }, extra || {})
  }

  /** review：伦理审批（IRB）＋知情同意 —— 缺则 `VMU_COMPLIANCE_APPROVAL_MISSING`，用 `item` 区分。 */
  function review({ protocolId, irb = null, consent = null, at = null } = {}) {
    const enforced = []
    if (!protocolId) throw deny('review', 'VMU_INVALID_ARGUMENT', 'review needs { protocolId }', 'pass the protocol id', enforced)
    if (C.irbRequired || C.gateRequired) {
      mark(enforced, 'vmu.compliance.irbRequired')
      if (!(irb && irb.approved === true)) {
        mark(enforced, 'vmu.compliance.requireApprovalGate')
        throw deny('review', 'VMU_COMPLIANCE_APPROVAL_MISSING', 'the ethics approval (IRB) is missing for ' + String(protocolId) + ' (item:' + 'irb' + ')', 'attach the IRB approval before any work starts', enforced, { item: 'irb', protocolId: String(protocolId), at: given(at) ? String(at) : String(clock()) })
      }
    }
    if (C.require.indexOf('consent') !== -1) {
      mark(enforced, 'vmu.compliance.require')
      if (!(consent && consent.signed === true)) {
        throw deny('review', 'VMU_COMPLIANCE_APPROVAL_MISSING', 'informed consent is not signed for ' + String(protocolId) + ' (item:' + 'consent' + ')', 'collect the signed consent (same code, distinguished by item)', enforced, { item: 'consent', protocolId: String(protocolId), at: given(at) ? String(at) : String(clock()) })
      }
    }
    return ok('review', enforced, enforced.slice(), { protocolId: String(protocolId), irb: !!irb, consent: !!consent, at: given(at) ? String(at) : String(clock()) })
  }

  /** retention：保留期超期 —— `VMU_COMPLIANCE_OVERDUE_BLOCK` ＋ **current/limit**。 */
  function retention({ keepDays = null, usedDays = null, at = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.compliance.overdueEscalation')
    const limit = numOf(keepDays, numOf(C.auditPrepLeadDays, 14))
    const current = numOf(usedDays, 0)
    if (current > limit) {
      throw deny('retention', 'VMU_COMPLIANCE_OVERDUE_BLOCK', 'data retention is over the limit: current=' + current + ' limit=' + limit, 'purge/redact to or below the limit (vmu.compliance.overdueEscalation=' + C.onOverdue + ')', enforced, { current, limit, at: given(at) ? String(at) : String(clock()) })
    }
    return ok('retention', enforced, [], { current, limit, over: false, at: given(at) ? String(at) : String(clock()) })
  }

  /** coi：利益冲突未申报 —— **已登记码** `VMU_COMPLIANCE_COI_UNDISCLOSED`。 */
  function coi({ who, declared = null, scope = null, at = null } = {}) {
    const enforced = []
    if (C.coiDisclosure) {
      mark(enforced, 'vmu.compliance.conflictOfInterestDisclosure')
      if (!who) throw deny('coi', 'VMU_INVALID_ARGUMENT', 'coi needs { who }', 'pass the member id', enforced)
      if (!(declared && declared.declared === true)) {
        mark(enforced, 'vmu.compliance.coiScope')
        throw deny('coi', 'VMU_COMPLIANCE_COI_UNDISCLOSED', 'conflict of interest is not disclosed for ' + String(who), 'file the COI disclosure (scope=' + strOf(scope, C.coiScope) + ')', enforced, { who: String(who), scope: strOf(scope, C.coiScope), at: given(at) ? String(at) : String(clock()) })
      }
    }
    return ok('coi', enforced, enforced.slice(), { who: who ? String(who) : null, declared: true, at: given(at) ? String(at) : String(clock()) })
  }

  /** exportData：受试者数据导出未批 —— `VMU_COMPLIANCE_EXPORT_BLOCKED`。 */
  function exportData({ studyId, approvedBy = null, redacted = null, at = null } = {}) {
    const enforced = []
    if (!studyId) throw deny('exportData', 'VMU_INVALID_ARGUMENT', 'exportData needs { studyId }', 'pass the study id', enforced)
    mark(enforced, 'vmu.compliance.redactionPolicy')
    if (!approvedBy) {
      throw deny('exportData', 'VMU_COMPLIANCE_EXPORT_BLOCKED', 'export of subject data is not approved for study ' + String(studyId), 'obtain approval (and redact per vmu.compliance.redactionPolicy=' + C.redaction + ')', enforced, { studyId: String(studyId), at: given(at) ? String(at) : String(clock()) })
    }
    if (C.redaction !== 'off' && !(redacted && redacted.done === true)) {
      throw deny('exportData', 'VMU_COMPLIANCE_EXPORT_BLOCKED', 'export is approved but NOT redacted for study ' + String(studyId), 'apply the redaction policy before export (' + C.redaction + ')', enforced, { studyId: String(studyId), redactionPolicy: C.redaction, at: given(at) ? String(at) : String(clock()) })
    }
    return ok('exportData', enforced, enforced.slice(), { studyId: String(studyId), approvedBy: String(approvedBy), redacted: true, at: given(at) ? String(at) : String(clock()) })
  }

  /** evidence：审计留痕缺失 —— `VMU_COMPLIANCE_EVIDENCE_INCOMPLETE`。 */
  function evidence({ kind = null, members = null, fields = null, at = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.compliance.evidenceKind')
    mark(enforced, 'vmu.compliance.evidenceMembers')
    mark(enforced, 'vmu.compliance.evidencePackFields')
    const missing = []
    if (strOf(kind, '') !== C.evidenceKind) missing.push('kind(' + C.evidenceKind + ')')
    const m = Array.isArray(members) ? members.length : 0
    if (C.evidenceMembers === 'all' && m === 0) missing.push('members(all)')
    if (!fields) missing.push('fields(' + C.evidenceFields + ')')
    if (missing.length) {
      throw deny('evidence', 'VMU_COMPLIANCE_EVIDENCE_INCOMPLETE', 'the audit evidence packet is incomplete: missing ' + missing.join(', '), 'provide the missing evidence parts before the audit', enforced, { missing, at: given(at) ? String(at) : String(clock()) })
    }
    return ok('evidence', enforced, enforced.slice(), { kind: C.evidenceKind, members: m, fieldsCount: 1, at: given(at) ? String(at) : String(clock()) })
  }

  /**
   * calendar：合规日历逾期 —— `VMU_COMPLIANCE_CALENDAR_MISSED`。
   *
   * task-230 (REAL DEFECT, fixed here): a NUMERIC instant must never be stringified before it is COMPARED.
   * `String(1000)` ⇒ `'1000'`, and `Date.parse('1000')` = **-30610224000000** — the year 1000, NOT NaN — so
   * `{ dueAt: 0, at: 1000 }` used to compare `0 < year-1000` ⇒ false ⇒ **silently passed** ✗. `ms()` (imported
   * from kernel/timevalue.js since task-231 — SINGLE source of truth) normalises both sides: a finite number IS
   * epoch-ms, anything else is parsed as an ISO string. (Trap for the next reader: `Date.parse` on a bare year
   * string is VALID input, so the bug is silent, never a crash.)
   */
  function calendar({ dueAt = null, at = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.compliance.auditPrepLeadDays')
    mark(enforced, 'vmu.compliance.reviewAlertLeadDays')
    mark(enforced, 'vmu.compliance.calendarDir')
    mark(enforced, 'vmu.compliance.calendarTemplate')
    const when = given(at) ? String(at) : String(clock())      // display form (echoed verbatim in the receipt)
    const whenMs = given(at) ? ms(at) : ms(clock())            // comparison form (numbers stay epoch-ms)
    if (!given(dueAt)) throw deny('calendar', 'VMU_INVALID_ARGUMENT', 'calendar needs { dueAt }', 'pass the compliance due date', enforced)
    const dueMs = ms(dueAt)
    const overDue = Number.isFinite(dueMs) && Number.isFinite(whenMs) ? dueMs < whenMs : String(dueAt) < when
    if (overDue) {
      throw deny('calendar', 'VMU_COMPLIANCE_CALENDAR_MISSED', 'the compliance calendar entry is overdue: due ' + String(dueAt) + ' < now ' + when, 'file the missing calendar entry in ' + C.calendarDir + '/' + C.calendarTemplate, enforced, { dueAt: String(dueAt), at: when, dueMs, whenMs })
    }
    return ok('calendar', enforced, [], { dueAt: String(dueAt), dir: C.calendarDir, template: C.calendarTemplate, leadDays: C.auditPrepLeadDays, alertLeadDays: C.reviewAlertLeadDays, at: when })
  }

  /** prepare：按 `prepare` 模式产出准备清单（回执字段 ⇒ 提醒/准备类键**改变了可观测行为** ✓）。 */
  function prepare({ protocolId = null, at = null } = {}) {
    const enforced = []
    mark(enforced, 'vmu.compliance.prepare')
    mark(enforced, 'vmu.compliance.domainPacks')
    return ok('prepare', enforced, [], {
      mode: C.prepare, protocolId: protocolId ? String(protocolId) : null,
      calendarDir: C.calendarDir, template: C.calendarTemplate,
      auditPrepLeadDays: C.auditPrepLeadDays, reviewAlertLeadDays: C.reviewAlertLeadDays,
      domainPacks: C.domainPacks, at: given(at) ? String(at) : String(clock()),
    })
  }

  /** status：只读（键接线情况 ＋ 计数 ＋ 未接点名）。 */
  function status() {
    state.reads += 1
    return {
      ok: true, apiVersion, enforcedScope: ENFORCED_SCOPE,
      wired: WIRED_KEYS.slice(), planned: PLANNED_KEYS.slice(), plannedReasons: Object.assign({}, PLANNED_REASONS),
      partition: { wired: WIRED_KEYS.length, planned: PLANNED_KEYS.length, total: WIRED_KEYS.length + PLANNED_KEYS.length },
      policy: {
        irbRequired: C.irbRequired, requireApprovalGate: C.gateRequired, require: C.require,
        coiDisclosure: C.coiDisclosure, coiScope: C.coiScope, overdueEscalation: C.onOverdue,
        redactionPolicy: C.redaction, evidenceKind: C.evidenceKind, evidenceMembers: C.evidenceMembers,
        evidencePackFields: C.evidenceFields, prepare: C.prepare, calendarDir: C.calendarDir,
        calendarTemplate: C.calendarTemplate, domainPacks: clone(C.domainPacks),
        auditPrepLeadDays: C.auditPrepLeadDays, reviewAlertLeadDays: C.reviewAlertLeadDays,
      },
      wouldEvaluate: clone(WOULD_EVALUATE),
      counts: { refusals: Object.assign({}, counters.refusals), ops: Object.assign({}, counters.ops), reads: state.reads, writes: state.writes },
      auditTail: audit.slice(-5),
      mechanism: { hasBus: !!bus, clockInjected: true, zeroMechanismSafe: true },
    }
  }

  return { review, retention, coi, exportData, evidence, calendar, prepare, status }
}
