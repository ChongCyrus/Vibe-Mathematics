// vmu kernel domain gate — 临床/动物审批闸（照 docs/20-§9.2/§9.3/§9.4 与 16 的生命周期闸点）。
//
// 硬不变式：① 未批不得开始（具名拒并**点名缺哪一项**）；② 同意版本不一致 ⇒ 拒，且**撤回可追溯**；
// ③ SAE 24h／AE 72h 超时 ⇒ 具名拒并给**观察/上报时刻与时限**；④ IACUC 过期或方案号缺失 ⇒ 拒；
// ⑤ 3R 缺项 ⇒ 拒并**点名哪一 R**；⑥ 设施资质/培训过期 ⇒ 拒（点名到期项）；⑦ `ledgerRef` **只引用**
// 22 卷台账 id（本模块**不定义**台账结构）；⑧ 截断必计数；⑨ 只用注入 clock；⑩ 未声明领域包 ⇒ **明确"无闸"**
// （不是"通过"）；只读面不改状态。
import { createHash } from 'node:crypto'
// task-231: the instant→ms rule is a SINGLE source of truth (kernel/timevalue.js). It was duplicated here and
// in compliance.js; the trap it documents (Date.parse('1000') = the YEAR 1000, never NaN) is why numbers must
// be handled as numbers BEFORE any stringification.
import { ms, msStrict } from './timevalue.js'

export const apiVersion = 1
export const DOMAINS = Object.freeze(['clinical', 'animal'])
export const THREE_R = Object.freeze(['replace', 'reduce', 'refine'])

/** 领域包的最小形状（`declare({domain, pack})` 的对象）：requires 列出本领域**必须满足**的项。 */
export const DEFAULT_PACKS = Object.freeze({
  clinical: Object.freeze({ domain: 'clinical', requires: ['registration', 'consent', 'training'], saeLimitMs: 24 * 3600 * 1000, aeLimitMs: 72 * 3600 * 1000 }),
  animal: Object.freeze({ domain: 'animal', requires: ['iacuc', 'threeR', 'facility', 'training', 'ledgerRef'], saeLimitMs: 24 * 3600 * 1000, aeLimitMs: 72 * 3600 * 1000 }),
})
/** 项 → 具名码（gate() 单点失败时用具体码，多点失败时用 VMU_GATE_UNSATISFIED 并逐项列出）。 */
export const ITEM_CODES = Object.freeze({
  registration: 'VMU_REGISTRATION_MISSING',
  iacuc: 'VMU_IACUC_EXPIRED',
  threeR: 'VMU_THREE_R_INCOMPLETE',
  facility: 'VMU_FACILITY_UNACCREDITED',
  training: 'VMU_TRAINING_EXPIRED',
  consent: 'VMU_CONSENT_VERSION_MISMATCH',
})

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra) Object.assign(e, extra)
  return e
}

const read = (s, k, d) => {
  if (!s) return d
  if (Object.prototype.hasOwnProperty.call(s, k)) return s[k]
  const short = k.split('.').pop()
  for (const host of [s.compliance, s.clinical, s.animal, s]) if (host && Object.prototype.hasOwnProperty.call(host, short)) return host[short]
  return d
}
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d }
const clone = (v) => JSON.parse(JSON.stringify(v))
const LEDGER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/   // 22 卷台账 id 的**引用形状**（结构归 22 卷）

export function createDomainGate({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createDomainGate needs a clock function', 'pass { clock }')
  const packs = new Map()
  const consents = new Map()   // studyId -> [ {version, effectiveAt, withdrawnAt, by, fingerprint} ]
  const reviews = new Map()    // protocolId -> review
  const reports = []           // sae/ae/death/deviation
  const dropped = { reports: 0 }
  const counts = { reads: 0, writes: 0 }

  const capReports = () => numOf(read(settings, 'vmu.compliance.maxReports', 1000), 1000)
  const limitFor = (kind, pack) => {
    const sae = numOf(read(settings, 'vmu.compliance.saeLimitMs', (pack && pack.saeLimitMs) || 24 * 3600 * 1000), 24 * 3600 * 1000)
    const ae = numOf(read(settings, 'vmu.compliance.aeLimitMs', (pack && pack.aeLimitMs) || 72 * 3600 * 1000), 72 * 3600 * 1000)
    if (kind === 'ae') return { limitMs: ae, limitLabel: '72h' }
    if (kind === 'sae' || kind === 'death') return { limitMs: sae, limitLabel: '24h' }
    return { limitMs: 0, limitLabel: 'none' }
  }
  const emit = (t, p) => { if (!bus || typeof bus.emit !== 'function') return null; try { return bus.emit(t, p) } catch (e) { log('domaingate: bus emit failed: ' + String((e && e.code) || e)); return null } }

  // task-217／task-231: epoch 0 is a LEGAL instant, so "not given" is decided EXPLICITLY. `given()` is the one
  // rule for every time input here; `ms()` (kernel/timevalue.js — the single shared implementation) accepts
  // finite millisecond NUMBERS as well as ISO strings, so a number is never re-parsed as a year and 0 survives.
  const given = (v) => v !== undefined && v !== null

  /** declare：声明一个领域包（clinical|animal）。未声明 ⇒ gate() 报"无闸"。 */
  function declare({ domain, pack } = {}) {
    const d = String(domain || '')
    if (!DOMAINS.includes(d)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown domain: ' + d, 'one of ' + DOMAINS.join('|'))
    const merged = Object.assign({}, DEFAULT_PACKS[d], (pack && typeof pack === 'object') ? pack : {})
    if (pack && Array.isArray(pack.requires)) merged.requires = pack.requires.map(String)
    merged.domain = d
    packs.set(d, merged)
    counts.writes += 1
    return { ok: true, domain: d, requires: merged.requires, declaredAt: clock() }
  }

  // task-238 (the FIFTEENTH case): an UNINTERPRETABLE instant is a NAMED refusal on EVERY input of this module,
  // never a silently stored string. `judge()` VALIDATES (and discards the number): the module keeps storing the
  // caller's verbatim form (`'0'` stays `'0'`, an ISO stays ISO), so no existing receipt shape changes.
  const judge = (v, label) => { msStrict(v, label); return v }
  /** consent：登记/撤回知情同意（版本化；撤回留痕 ⇒ 可追溯）。 */
  function consent({ studyId, version, effectiveAt, withdrawnAt = null, by = null } = {}) {
    if (!studyId) throw refuse('VMU_INVALID_ARGUMENT', 'consent needs { studyId }', 'pass { studyId }')
    if (!version) throw refuse('VMU_INVALID_ARGUMENT', 'consent needs { version }', 'a consent without a version cannot be checked later')
    if (given(effectiveAt)) judge(effectiveAt, 'consent `effectiveAt`')
    if (given(withdrawnAt)) judge(withdrawnAt, 'consent `withdrawnAt`')
    const at = given(effectiveAt) ? effectiveAt : clock()
    const list = consents.get(String(studyId)) || []
    const rec = {
      version: String(version), effectiveAt: String(at), withdrawnAt: given(withdrawnAt) ? String(withdrawnAt) : null, by: by ? String(by) : null,
      fingerprint: createHash('sha256').update(JSON.stringify({ studyId: String(studyId), version: String(version), at: String(at), w: given(withdrawnAt) ? String(withdrawnAt) : null })).digest('hex').slice(0, 16),
    }
    list.push(rec)
    consents.set(String(studyId), list)
    counts.writes += 1
    emit('record/appended', { studyId: String(studyId), consentVersion: rec.version, withdrawn: !!rec.withdrawnAt })
    return { ok: true, studyId: String(studyId), version: rec.version, effectiveAt: rec.effectiveAt, withdrawnAt: rec.withdrawnAt, fingerprint: rec.fingerprint, history: list.length }
  }

  /** 撤回：显式留痕（可追溯），并把撤回时刻写进历史。 */
  function withdraw({ studyId, version, at = null, by = null } = {}) {
    if (given(at)) judge(at, 'withdraw `at`')
    const list = consents.get(String(studyId)) || []
    const target = [...list].reverse().find((r) => (version === undefined ? true : r.version === String(version)))
    if (!target) throw refuse('VMU_GATE_UNSATISFIED', 'no consent to withdraw for study ' + String(studyId), 'call consent({ studyId, version }) first')
    if (given(target.withdrawnAt)) return { ok: true, studyId: String(studyId), version: target.version, withdrawnAt: target.withdrawnAt, alreadyWithdrawn: true }
    target.withdrawnAt = String(given(at) ? at : clock())
    target.withdrawnBy = by ? String(by) : null
    counts.writes += 1
    emit('record/appended', { studyId: String(studyId), consentWithdrawn: target.version, at: target.withdrawnAt })
    return { ok: true, studyId: String(studyId), version: target.version, withdrawnAt: target.withdrawnAt, traceable: true }
  }

  /** checkConsent：版本不一致 ⇒ 具名拒；已撤回 ⇒ 拒（并给撤回时刻）。 */
  function checkConsent({ studyId, version, at = null } = {}) {
    if (given(at)) judge(at, 'checkConsent `at`')
    const list = consents.get(String(studyId)) || []
    const when = given(at) ? at : clock()
    if (!list.length) throw refuse('VMU_GATE_UNSATISFIED', 'no consent on file for study ' + String(studyId), 'register it first: consent({ studyId, version, effectiveAt })')
    const valid = [...list].reverse().find((r) => !r.withdrawnAt && String(r.effectiveAt) <= String(when))
    if (!valid) {
      const last = list[list.length - 1]
      throw refuse('VMU_GATE_UNSATISFIED', 'the consent for study ' + String(studyId) + ' is withdrawn (at ' + String(last.withdrawnAt) + ')',
        'a withdrawn consent is traceable but never usable; obtain a new one (history=' + list.length + ')')
    }
    if (version !== undefined && String(version) !== valid.version) {
      throw refuse('VMU_CONSENT_VERSION_MISMATCH', 'consent version mismatch for study ' + String(studyId) + ': requested ' + String(version) + ' but the effective version is ' + valid.version,
        'use the effective version (' + valid.version + ', effectiveAt=' + valid.effectiveAt + ') or re-consent explicitly')
    }
    counts.reads += 1
    return { ok: true, studyId: String(studyId), version: valid.version, effectiveAt: valid.effectiveAt, matches: true }
  }

  /** report：SAE 24h／AE 72h 时限；超时 ⇒ 具名拒并给观察/上报时刻与时限。 */
  function report({ kind, observedAt, reportedAt, studyId = null, protocolId = null } = {}) {
    const k = String(kind || '')
    if (!['sae', 'ae', 'death', 'deviation'].includes(k)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown report kind: ' + k, 'one of sae|ae|death|deviation')
    if (!given(observedAt)) throw refuse('VMU_INVALID_ARGUMENT', 'report needs { observedAt }', 'the observed time is required for the deadline check (epoch 0 is a legal instant)')
    const obs = ms(observedAt), rep = ms(given(reportedAt) ? reportedAt : clock())
    if (!Number.isFinite(obs) || !Number.isFinite(rep)) throw refuse('VMU_INVALID_ARGUMENT', 'report needs ISO timestamps', 'pass observedAt/reportedAt as ISO strings')
    const pack = packs.get(studyId ? 'clinical' : (protocolId ? 'animal' : '')) || null
    const { limitMs, limitLabel } = limitFor(k, pack)
    const deltaMs = rep - obs
    if (limitMs > 0 && deltaMs > limitMs) {
      throw refuse('VMU_SAE_REPORT_OVERDUE', 'report of kind "' + k + '" is overdue: observed ' + String(observedAt) + ' → reported ' + String(reportedAt) + ' = ' + Math.round(deltaMs / 3600000) + 'h > limit ' + limitLabel,
        'the limit is ' + limitLabel + ' (' + limitMs + 'ms); escalate immediately and record why the deadline was missed', { observedAt: String(observedAt), reportedAt: String(reportedAt), limitMs, limitLabel, deltaMs })
    }
    reports.push({ kind: k, observedAt: String(observedAt), reportedAt: String(reportedAt), studyId: studyId ? String(studyId) : null, protocolId: protocolId ? String(protocolId) : null, deltaMs, at: clock() })
    const cap = capReports()
    while (reports.length > cap) { reports.shift(); dropped.reports += 1 }
    counts.writes += 1
    emit('record/appended', { reportKind: k, studyId, protocolId })
    return { ok: true, kind: k, withinLimit: true, deltaMs, limitMs, limitLabel, dropped: dropped.reports }
  }

  /** review：IACUC/伦理审查登记；过期或方案号缺失 ⇒ 拒；3R/设施/培训逐项校验；ledgerRef 只引用 22 卷 id。 */
  function review({ protocolId, approvedAt, expiresAt, threeR = null, anesthesia = null, facility = null, training = null, ledgerRef = null, at = null } = {}) {
    if (given(at)) judge(at, 'review `at`')
    const when = String(given(at) ? at : clock())
    if (protocolId === undefined || protocolId === null || String(protocolId).trim() === '') {
      throw refuse('VMU_REGISTRATION_MISSING', 'review needs { protocolId }: the protocol registration number is missing', 'register the protocol id (IACUC/IRB number) before any work starts')
    }
    if (!given(expiresAt)) throw refuse('VMU_IACUC_EXPIRED', 'review needs { expiresAt }: an approval without an expiry cannot be gated', 'pass the approval expiry date (epoch 0 is a legal instant — it will then read as expired)')
    judge(expiresAt, 'review `expiresAt`')     // task-238: 'nope' must not silently compare as a string
    if (given(approvedAt)) judge(approvedAt, 'review `approvedAt`')
    if (String(expiresAt) <= when) {
      throw refuse('VMU_IACUC_EXPIRED', 'the approval for ' + String(protocolId) + ' expired at ' + String(expiresAt) + ' (now ' + when + ')', 'renew the approval before starting any work')
    }
    if (threeR !== null) {
      const miss = THREE_R.filter((r) => !(threeR && threeR[r]))
      if (miss.length) throw refuse('VMU_THREE_R_INCOMPLETE', 'the 3R statement is incomplete: missing ' + miss.join(', '), 'answer every R (' + THREE_R.join('/') + '); missing: ' + miss.join(', '))
    }
    if (facility !== null) {
      const okAcc = facility && facility.accredited === true
      const validUntil = facility && facility.validUntil
      if (!okAcc || (given(validUntil) && String(validUntil) <= when)) {
        throw refuse('VMU_FACILITY_UNACCREDITED', 'the facility is not accredited for this protocol' + (given(validUntil) ? ' (validUntil ' + String(validUntil) + ' ≤ ' + when + ')' : ''), 'use an accredited facility with a valid Until date')
      }
    }
    if (training !== null) {
      const list = Array.isArray(training) ? training : [training]
      const bad = list.filter((t) => t && given(t.validUntil) && String(t.validUntil) <= when).map((t) => String((t && (t.who || t.id)) || 'unknown'))
      if (bad.length) throw refuse('VMU_TRAINING_EXPIRED', 'training is expired for: ' + bad.join(', '), 'renew the training of ' + bad.join(', ') + ' before the work starts')
    }
    if (ledgerRef !== null && ledgerRef !== undefined) {
      if (typeof ledgerRef !== 'string' || !LEDGER_ID.test(ledgerRef)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'ledgerRef must be an existing LEDGER ID (a string), got ' + JSON.stringify(ledgerRef), 'this module only REFERENCES the ledger ids defined in vol 22 — it never defines ledger structure')
      }
    }
    const rec = { protocolId: String(protocolId), approvedAt: given(approvedAt) ? String(approvedAt) : null, expiresAt: String(expiresAt), threeR: threeR ? clone(threeR) : null, anesthesia: anesthesia ? clone(anesthesia) : null, facility: facility ? clone(facility) : null, training: training ? clone(training) : null, ledgerRef: ledgerRef ? String(ledgerRef) : null, at: when }
    reviews.set(rec.protocolId, rec)
    counts.writes += 1
    return { ok: true, protocolId: rec.protocolId, expiresAt: rec.expiresAt, ledgerRef: rec.ledgerRef }
  }

  /** gate：机器可判定的闸。未声明包 ⇒ 明确"无闸"（gated:false，**不是**"通过"）；否则缺项 ⇒ 具名拒。 */
  function gate({ domain, at = null, studyId = null, protocolId = null, consentVersion = undefined } = {}) {
    if (given(at)) judge(at, 'gate `at`')
    const d = String(domain || '')
    const pack = packs.get(d)
    const when = String(given(at) ? at : clock())
    if (!pack) {
      counts.reads += 1
      return { ok: true, gated: false, verdict: 'no-gate', domain: d, at: when, note: 'no domain pack is declared: this is explicitly NO GATE (not a pass) — declare({ domain }) to enable it' }
    }
    const problems = []
    const need = pack.requires || []
    const rev = protocolId ? reviews.get(String(protocolId)) : (need.includes('iacuc') || need.includes('registration') ? [...reviews.values()][0] : null)
    for (const item of need) {
      if (item === 'registration') { if (!rev || !rev.protocolId) problems.push({ item, code: ITEM_CODES.registration, why: 'no protocol registration on file' }) }
      else if (item === 'iacuc') {
        if (!rev) problems.push({ item, code: ITEM_CODES.iacuc, why: 'no IACUC review registered' })
        else if (!rev.expiresAt || rev.expiresAt <= when) problems.push({ item, code: ITEM_CODES.iacuc, why: 'approval expired at ' + rev.expiresAt + ' (now ' + when + ')' })
      } else if (item === 'threeR') {
        if (!rev || !rev.threeR || THREE_R.some((r) => !rev.threeR[r])) problems.push({ item, code: ITEM_CODES.threeR, why: '3R incomplete: missing ' + THREE_R.filter((r) => !(rev && rev.threeR && rev.threeR[r])).join(', ') })
      } else if (item === 'facility') {
        if (!rev || !rev.facility || rev.facility.accredited !== true || (given(rev.facility.validUntil) && rev.facility.validUntil <= when)) problems.push({ item, code: ITEM_CODES.facility, why: 'facility not accredited / expired' })
      } else if (item === 'training') {
        const list = rev && rev.training ? (Array.isArray(rev.training) ? rev.training : [rev.training]) : []
        if (!list.length) problems.push({ item, code: ITEM_CODES.training, why: 'no training record on file' })
        else if (list.some((t) => t && given(t.validUntil) && String(t.validUntil) <= when)) problems.push({ item, code: ITEM_CODES.training, why: 'training expired for ' + list.filter((t) => given(t.validUntil) && t.validUntil <= when).map((t) => t.who || t.id || 'unknown').join(', ') })
      } else if (item === 'ledgerRef') {
        if (!rev || !rev.ledgerRef) problems.push({ item, code: 'VMU_REGISTRATION_MISSING', why: 'no ledgerRef (vol 22 ledger id) referenced' })
      } else if (item === 'consent') {
        try { if (studyId) checkConsent({ studyId, version: consentVersion, at: when }); else problems.push({ item, code: ITEM_CODES.consent, why: 'no studyId supplied for the consent check' }) }
        catch (e) { problems.push({ item, code: e.code || ITEM_CODES.consent, why: String(e.message) }) }
      } else {
        problems.push({ item, code: 'VMU_GATE_UNSATISFIED', why: 'unknown requirement "' + item + '" cannot be satisfied' })
      }
    }
    counts.reads += 1
    if (problems.length) {
      const names = problems.map((p) => p.item + ' (' + p.code + ')')
      const single = problems.length === 1
      throw refuse(single ? problems[0].code : 'VMU_GATE_UNSATISFIED',
        'the ' + d + ' gate is NOT satisfied: missing/invalid ' + names.join(', '),
        (single ? problems[0].why + '; ' : '') + 'satisfy every required item (' + need.join(', ') + ') before starting work',
        { items: problems, domain: d, at: when })
    }
    return { ok: true, gated: true, verdict: 'satisfied', domain: d, at: when, checked: need }
  }

  /** status：只读（含"无闸"事实与截断计数）。 */
  function status() {
    counts.reads += 1
    return {
      ok: true, apiVersion, domains: [...DOMAINS],
      declared: [...packs.keys()],
      declaredCount: packs.size,
      gate: packs.size === 0 ? 'no-gate' : 'active',
      note: packs.size === 0 ? 'no domain pack declared ⇒ gate() reports "no-gate" (never "passed")' : 'declared packs: ' + [...packs.keys()].join(','),
      reviews: [...reviews.values()].map((r) => ({ protocolId: r.protocolId, expiresAt: r.expiresAt, ledgerRef: r.ledgerRef })),
      consents: [...consents.entries()].map(([studyId, list]) => ({ studyId, versions: list.map((r) => r.version + (r.withdrawnAt ? '/withdrawn@' + r.withdrawnAt : '')) })),
      reports: reports.length, dropped: { reports: dropped.reports },
      policy: { maxReports: capReports(), saeLimitMs: limitFor('sae', null).limitMs, aeLimitMs: limitFor('ae', null).limitMs, threeR: [...THREE_R], ledgerRefShape: String(LEDGER_ID) },
      mechanism: { hasBus: !!bus, clockInjected: true },
      counts: { reads: counts.reads, writes: counts.writes },
    }
  }

  return { declare, gate, consent, withdraw, checkConsent, report, review, status }
}
