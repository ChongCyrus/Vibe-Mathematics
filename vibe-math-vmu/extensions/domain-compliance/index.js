// vibe-math-vmu — 领域合规面（20 卷 §9.1–§9.4）：**领域合规包**的挂点、审批闸、复审与证据包。
//
// ★ 范围基准（2026-10-11）：**本面是【机制】✓，不是【领域实例】** —— 通用部分（未满足 X 证据 ⇒ 不得发生 Y 动作，fail-closed 且留痕）
//   对数学研究（双重用途／涉人问卷／个人数据／出口管制）**有真实消费者，保留** ✓；但**临床与动物两个领域族对数学研究举不出消费者** ✗，
//   已**降级为扩展**（见 docs/23），**待移出内核键族、改由 pack 声明** —— 在移出完成前，本行的存在**本身就是"待改"的证据** ✗。
//
// ★ 本卷的明文边界（**必须遵守，不是风格问题** ✗✓）：**不内置任何法条文本** ✗ —— 平台**不是法律意见提供者**，**法条会变、法域不同**；
//   本面只做 §9.1 说的**三件可组合的东西** ✓：**① 可声明钩子点（不新增钩子 ✗）② 模板位（只引用 22 的台账/凭证面 ✓）③ 检查表（判据＋证据指针＋失败码 ✓）**。
// ★ 抽象上**一个领域包＝一句可判定的话**：**「未满足 X 证据 ⇒ 不得发生 Y 动作」** ✓ —— 本面的 `gate()` 就是它的执行点 ✓。
// ★ 闸未满足 ⇒ **动作不发生（fail-closed）** ✓ **且必须留痕** ✓（§9.4① 的失败语义 ✓）。
// ★ 只引用不重定义 ✓：去标识化归 §7（`vmu.privacy.*` ✓）、复审提醒机制归 21-§5.3 ✓、台账与证据包的打包/指纹/签名/保留归 22／07 ✓。
//
// 注入：`createDomainCompliance({ clock, log, settings })`

export const DOMAIN_KEYS = Object.freeze([
  // §9.2 临床/医学（N2）
  'vmu.clinical.registrationRequired', 'vmu.clinical.registrationId', 'vmu.clinical.registrationIdPattern',
  'vmu.clinical.consentVersioning', 'vmu.clinical.saeReportLimitHours', 'vmu.clinical.aeReportLimitHours',
  'vmu.clinical.reportChannel', 'vmu.clinical.deviationRegister', 'vmu.clinical.unblindingRequiresReason',
  // §9.3 动物实验（N3）
  'vmu.animal.iacucRequired', 'vmu.animal.protocolId', 'vmu.animal.reviewCycleDays',
  'vmu.animal.threeRRequired', 'vmu.animal.anesthesiaRequired', 'vmu.animal.deathReportLimitHours',
  'vmu.animal.facilityAccreditation', 'vmu.animal.trainingRequired', 'vmu.animal.ledgerRef',
  // §9.1 领域包自身的声明
  'vmu.compliance.domainPacks', 'vmu.compliance.requireApprovalGate', 'vmu.compliance.evidenceKind',
])

export const CODE = Object.freeze({
  gate: 'VMU_GATE_UNSATISFIED',
  packMissing: 'VMU_DOMAIN_PACK_MISSING',
  registration: 'VMU_REGISTRATION_MISSING',
  consent: 'VMU_CONSENT_VERSION_MISMATCH',
  sae: 'VMU_SAE_REPORT_OVERDUE',
  ae: 'VMU_AE_REPORT_OVERDUE',
  deviation: 'VMU_PROTOCOL_DEVIATION_MISSING',
  unblinding: 'VMU_UNBLINDING_UNLOGGED',
  iacucMissing: 'VMU_IACUC_APPROVAL_MISSING',
  iacucExpired: 'VMU_IACUC_EXPIRED',
  threeR: 'VMU_THREE_R_INCOMPLETE',
  anesthesia: 'VMU_ANESTHESIA_UNDECLARED',
  endpoint: 'VMU_HUMANE_ENDPOINT_REPORT_OVERDUE',
  facility: 'VMU_FACILITY_UNACCREDITED',
  training: 'VMU_TRAINING_EXPIRED',
  ledger: 'VMU_ANIMAL_LEDGER_MISSING',
  reviewDue: 'VMU_REVIEW_DUE',
})

const DOMAINS = Object.freeze(['clinical', 'animal'])
const DAY_MS = 86400000
const refuse = (code, message, hint, missing) => Object.assign({ ok: false, code, message, hint }, missing ? { missing } : {})

export function createDomainCompliance(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const trail = []
  const note = (what, extra) => {
    trail.push(Object.assign({ at: clock(), what }, extra || {}))
    try { log({ what, at: clock(), ...(extra || {}) }) } catch (e) { /* 记录不改结果 */ }
  }

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? v : d }
    const s = (k, d) => { const v = readKey(k); return typeof v === 'string' ? v : d }
    const b = (k, d) => (readKey(k) === undefined ? d : readKey(k) === true)
    return {
      clinical: {
        registrationRequired: b('vmu.clinical.registrationRequired', true),
        registrationId: s('vmu.clinical.registrationId', ''),
        registrationIdPattern: s('vmu.clinical.registrationIdPattern', ''),
        consentVersioning: b('vmu.clinical.consentVersioning', true),
        saeReportLimitHours: n('vmu.clinical.saeReportLimitHours', 24),
        aeReportLimitHours: n('vmu.clinical.aeReportLimitHours', 72),
        reportChannel: s('vmu.clinical.reportChannel', ''),
        deviationRegister: b('vmu.clinical.deviationRegister', true),
        unblindingRequiresReason: b('vmu.clinical.unblindingRequiresReason', true),
      },
      animal: {
        iacucRequired: b('vmu.animal.iacucRequired', true),
        protocolId: s('vmu.animal.protocolId', ''),
        reviewCycleDays: n('vmu.animal.reviewCycleDays', 365),
        threeRRequired: b('vmu.animal.threeRRequired', true),
        anesthesiaRequired: b('vmu.animal.anesthesiaRequired', true),
        deathReportLimitHours: n('vmu.animal.deathReportLimitHours', 24),
        facilityAccreditation: s('vmu.animal.facilityAccreditation', ''),
        trainingRequired: b('vmu.animal.trainingRequired', true),
        ledgerRef: s('vmu.animal.ledgerRef', ''),
      },
      compliance: {
        domainPacks: (() => { const v = readKey('vmu.compliance.domainPacks'); return Array.isArray(v) ? v.map(String).filter(Boolean) : [] })(),
        requireApprovalGate: b('vmu.compliance.requireApprovalGate', true),
        evidenceKind: s('vmu.compliance.evidenceKind', 'compliance-evidence'),
      },
    }
  }
  const keysUsed = () => DOMAIN_KEYS.slice()

  /** ① 领域包是否齐备（§9.1 三件套）：启用了某域但挂点/证据位缺失 ⇒ 具名拒。 */
  const packs = () => {
    const c = cfg()
    const out = []
    for (const d of DOMAINS) {
      const enabled = c.compliance.domainPacks.includes(d)
      out.push({ domain: d, enabled, checks: d === 'clinical' ? 5 : 6, evidenceKind: c.compliance.evidenceKind })
    }
    const unknown = c.compliance.domainPacks.filter((d) => !DOMAINS.includes(d))
    return { ok: unknown.length === 0, declared: c.compliance.domainPacks.slice(), packs: out, unknown,
      requireApprovalGate: c.compliance.requireApprovalGate }
  }

  /** 每一条必答项的判据，返回缺失项的名字（不返回则视为满足）。 */
  const clinicalChecks = (sub) => {
    const c = cfg().clinical
    const missing = []
    if (c.registrationRequired) {
      const id = String((sub && sub.registrationId) || c.registrationId || '')
      if (!id) missing.push({ item: '试验注册号', key: 'vmu.clinical.registrationId', code: CODE.registration })
      else if (c.registrationIdPattern) {
        let re = null
        try { re = new RegExp(c.registrationIdPattern) } catch (e) { re = null }
        if (re && !re.test(id)) missing.push({ item: '试验注册号不符合 pattern', key: 'vmu.clinical.registrationIdPattern', code: CODE.registration })
      }
    }
    if (c.consentVersioning) {
      const consent = (sub && sub.consent) || null
      if (!consent || !String(consent.version || '') || consent.effectiveAt === undefined) {
        missing.push({ item: '知情同意须含 version 与 effectiveAt', key: 'vmu.clinical.consentVersioning', code: CODE.consent })
      } else if (sub.currentConsentVersion !== undefined && String(consent.version) !== String(sub.currentConsentVersion)) {
        missing.push({ item: '受试所用同意版本 ≠ 当前生效版本', key: 'vmu.clinical.consentVersioning', code: CODE.consent })
      }
    }
    for (const ev of Array.isArray(sub && sub.events) ? sub.events : []) {
      const sev = String((ev && ev.severity) || '').toLowerCase()
      const isSae = sev === 'sae' || sev === 'serious'
      const limit = isSae ? c.saeReportLimitHours : c.aeReportLimitHours
      const obs = Number(ev && ev.observedAt)
      const rep = Number(ev && ev.reportedAt)
      if (Number.isFinite(obs) && Number.isFinite(rep) && (rep - obs) / 3600000 > limit) {
        missing.push({ item: (isSae ? 'SAE' : 'AE') + ' 上报超时（>' + limit + 'h）', key: isSae ? 'vmu.clinical.saeReportLimitHours' : 'vmu.clinical.aeReportLimitHours', code: isSae ? CODE.sae : CODE.ae })
      }
    }
    if (c.deviationRegister) {
      for (const d of Array.isArray(sub && sub.deviations) ? sub.deviations : []) {
        const kind = String((d && d.kind) || '').toLowerCase()
        const complete = d && d.reason !== undefined && d.at !== undefined && d.action !== undefined
        if ((kind === 'major' || kind === 'minor') && !complete) {
          missing.push({ item: '方案偏离须含 kind/reason/at/action', key: 'vmu.clinical.deviationRegister', code: CODE.deviation })
        }
      }
      const undeclaredMajor = (sub && sub.majorDeviations === true) && !(Array.isArray(sub.deviations) && sub.deviations.length)
      if (undeclaredMajor) missing.push({ item: 'major 偏离未登记', key: 'vmu.clinical.deviationRegister', code: CODE.deviation })
    }
    if (c.unblindingRequiresReason) {
      for (const u of Array.isArray(sub && sub.unblindings) ? sub.unblindings : []) {
        if (u && (!u.who || !u.why || u.at === undefined)) {
          missing.push({ item: '揭盲须记 who/why/at', key: 'vmu.clinical.unblindingRequiresReason', code: CODE.unblinding })
        } else if (u && u.emergency === true && u.reviewedAt === undefined) {
          missing.push({ item: '紧急揭盲须事后复核登记', key: 'vmu.clinical.unblindingRequiresReason', code: CODE.unblinding })
        }
      }
    }
    return missing
  }

  const animalChecks = (sub, at) => {
    const c = cfg().animal
    const missing = []
    const now = Number.isFinite(Number(at)) ? Number(at) : clock()
    if (c.iacucRequired) {
      const p = (sub && sub.protocol) || null
      const pid = String((p && p.protocolId) || c.protocolId || '')
      if (!pid || !p || !p.species) {
        missing.push({ item: 'IACUC 方案须含 protocolId 与 species', key: 'vmu.animal.protocolId', code: CODE.iacucMissing })
      } else if (p.approvedAt === undefined || p.expiresAt === undefined) {
        missing.push({ item: 'IACUC 方案须含 approvedAt 与 expiresAt', key: 'vmu.animal.iacucRequired', code: CODE.iacucMissing })
      } else if (Number(p.approvedAt) > now) {
        // MEASURED CORRECTION: an approval that has not taken effect means NO APPROVAL IS IN FORCE, which is the MISSING code - the
        // expiry code is for an approval that existed and lapsed. The volume lists exactly these two, and the distinction is what
        // makes a receipt readable.
        missing.push({ item: 'IACUC 尚未生效（approvedAt 在未来 ⇒ 当前无有效批准）',
          key: 'vmu.animal.reviewCycleDays', code: CODE.iacucMissing })
      } else if (Number(p.expiresAt) <= now) {
        missing.push({ item: 'IACUC 已过期（expiresAt ≤ now）',
          key: 'vmu.animal.reviewCycleDays', code: CODE.iacucExpired })
      }
    }
    if (c.threeRRequired) {
      const t = (sub && sub.threeR) || null
      const parts = ['replacement', 'reduction', 'refinement']
      const blank = parts.filter((x) => !t || t[x] === undefined || String(t[x]).trim() === '')
      if (blank.length) missing.push({ item: '3R 逐条非空（缺 ' + blank.join('、') + '）', key: 'vmu.animal.threeRRequired', code: CODE.threeR })
    }
    if (c.anesthesiaRequired) {
      const a = (sub && sub.anesthesia) || null
      const waivedWithReason = a && a.waived === true && String(a.reason || '').trim() !== ''
      if (!waivedWithReason && (!a || String(a.plan || '').trim() === '')) {
        missing.push({ item: '麻醉/镇痛方案未声明（豁免须给理由）', key: 'vmu.animal.anesthesiaRequired', code: CODE.anesthesia })
      }
    }
    if (c.facilityAccreditation) {
      const f = (sub && sub.facility) || null
      if (!f || String(f.facilityId || '') !== c.facilityAccreditation || f.validUntil === undefined || Number(f.validUntil) <= now) {
        missing.push({ item: '设施资质缺失或过期', key: 'vmu.animal.facilityAccreditation', code: CODE.facility })
      }
    }
    if (c.trainingRequired) {
      for (const person of Array.isArray(sub && sub.personnel) ? sub.personnel : []) {
        if (!person || !person.trainingId || person.completedAt === undefined || person.validUntil === undefined || Number(person.validUntil) <= now) {
          missing.push({ item: '人员培训缺失或过期：' + String((person && person.personId) || '?'), key: 'vmu.animal.trainingRequired', code: CODE.training })
        }
      }
    }
    if (c.ledgerRef) {
      const l = (sub && sub.ledger) || null
      if (!l || String(l.ref || '') !== c.ledgerRef) {
        missing.push({ item: '动物台账未引用（22-§2/§8 的对象 id）', key: 'vmu.animal.ledgerRef', code: CODE.ledger })
      }
    }
    for (const ev of Array.isArray(sub && sub.events) ? sub.events : []) {
      const kind = String((ev && ev.kind) || '')
      if (kind !== 'humane-endpoint' && kind !== 'unexpected-death') continue
      const obs = Number(ev && ev.at)
      const rep = Number(ev && ev.reportedAt)
      if (Number.isFinite(obs) && Number.isFinite(rep) && (rep - obs) / 3600000 > c.deathReportLimitHours) {
        missing.push({ item: kind + ' 上报超时（>' + c.deathReportLimitHours + 'h）', key: 'vmu.animal.deathReportLimitHours', code: CODE.endpoint })
      }
    }
    return missing
  }

  /**
   * ① 审批闸（§9.4）：`gate({ domain, subject, at })` → **未批 / 过期 / 缺必答 ⇒ 拒并【点名缺哪一项】**。
   * **fail-closed 且必须留痕** ✓：被拦下的尝试要记下"谁在何时试图做什么、被哪条闸拦住"。
   */
  const gate = (a) => {
    const args = a || {}
    const domain = String(args.domain || '')
    const c = cfg()
    if (!DOMAINS.includes(domain)) {
      return refuse('VMU_META_VALIDATION_FAILED', 'gate 的 domain 只能是 clinical／animal：' + JSON.stringify(domain), '见 20 卷 §9.2／§9.3')
    }
    if (c.compliance.domainPacks.length && !c.compliance.domainPacks.includes(domain)) {
      const r = refuse(CODE.packMissing, '启用了领域包但未声明 ' + domain + '（vmu.compliance.domainPacks）', '把 ' + domain + ' 加进 vmu.compliance.domainPacks，或清空该声明')
      note('compliance.gate', { domain, blocked: CODE.packMissing })
      return r
    }
    const at = args.at === undefined ? clock() : Number(args.at)
    const missing = domain === 'clinical' ? clinicalChecks(args.subject) : animalChecks(args.subject, at)
    if (missing.length) {
      note('compliance.gate', { domain, blocked: CODE.gate, items: missing.map((m) => m.item) })
      return Object.assign(refuse(CODE.gate, '审批闸未满足（' + domain + '）：缺 ' + missing.map((m) => m.item).join('；'),
        '补齐上述必答项；本节口径是 fail-closed，动作不发生'), { missing })
    }
    note('compliance.gate', { domain, passed: true })
    return { ok: true, domain, at, evidenceKind: c.compliance.evidenceKind,
      enforced: domain === 'clinical' ? DOMAIN_KEYS.filter((k) => k.startsWith('vmu.clinical.')).slice() : DOMAIN_KEYS.filter((k) => k.startsWith('vmu.animal.')) }
  }

  /** ② 到期与复审（§9.4②）：只声明"复审到期"应产生的对象与码；**提醒机制归 21-§5.3** ✗。 */
  const reviewDue = (a) => {
    const args = a || {}
    const c = cfg()
    const at = args.at === undefined ? clock() : Number(args.at)
    const expiresAt = Number(args.expiresAt)
    const lead = Number.isFinite(Number(args.leadDays)) ? Number(args.leadDays) : 30
    if (!Number.isFinite(expiresAt)) return refuse('VMU_META_VALIDATION_FAILED', 'reviewDue 需要 expiresAt', '给 { expiresAt, at? }')
    const dueAt = expiresAt - lead * DAY_MS
    const due = at >= dueAt
    if (due) note('compliance.reviewDue', { subject: args.subjectId || null, expiresAt })
    return { ok: true, subject: String(args.subjectId || ''), expiresAt, dueAt, due, code: due ? CODE.reviewDue : null,
      note: due ? '到期未复审（提醒用，不是拒绝）✓ 提醒机制见 21-§5.3' : '未到期' }
  }

  /** ③ 证据包（§9.4③）：只声明【必需成员清单】；**打包/指纹/签名/保留归 22 与 07** ✗。 */
  const evidencePack = (a) => {
    const args = a || {}
    const c = cfg()
    const members = [
      { id: 'registration', present: String((args.subject && args.subject.registrationId) || c.clinical.registrationId || '') !== '' },
      { id: 'consent-version', present: Boolean(args.subject && args.subject.consent && args.subject.consent.version) },
      { id: 'event-reports', present: Array.isArray(args.subject && args.subject.events) && args.subject.events.length > 0 },
      { id: 'three-r', present: Boolean(args.subject && args.subject.threeR) },
      { id: 'approval-and-accreditation', present: Boolean((args.subject && args.subject.protocol) || (args.subject && args.subject.facility)) },
      { id: 'deviation-register', present: Array.isArray(args.subject && args.subject.deviations) },
      { id: 'deidentification', present: Boolean(args.subject && args.subject.deidentified === true) },
    ]
    const absent = members.filter((m) => !m.present).map((m) => m.id)
    return { ok: true, kind: c.compliance.evidenceKind, members, absent,
      complete: absent.length === 0,
      note: '本面只声明必需成员；打包/指纹/签名/保留由 22（凭证与证据包）与 07（归档/保留）负责 ✗' }
  }

  const summary = () => {
    const c = cfg()
    const p = packs()
    return { ok: true, declared: p.declared, unknown: p.unknown, requireApprovalGate: c.compliance.requireApprovalGate,
      evidenceKind: c.compliance.evidenceKind, trail: trail.length,
      clinical: { registrationRequired: c.clinical.registrationRequired, saeReportLimitHours: c.clinical.saeReportLimitHours, aeReportLimitHours: c.clinical.aeReportLimitHours },
      animal: { iacucRequired: c.animal.iacucRequired, reviewCycleDays: c.animal.reviewCycleDays, deathReportLimitHours: c.animal.deathReportLimitHours } }
  }

  return { gate, packs, reviewDue, evidencePack, status: summary, keysUsed, config: cfg, trail: () => trail.slice() }
}

export default createDomainCompliance
