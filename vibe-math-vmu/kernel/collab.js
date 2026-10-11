// vmu kernel · collab — the CROSS-INSTITUTION COLLABORATION face（docs/22 §协作, contracts at the consolidated parameter
// table lines 721-727; docs/17 delegation/identity and docs/20 data-sharing are REFERENCED, never redefined here）.
//
// WHAT IT IS: a counterparty register, the agreements made with them, expiry warning, the data-sharing template that
// governs an exchange, joint-authorship policy and the settlement cycle with its reconciliation tolerance. It owns exactly
// the seven declared `vmu.collab.*` keys and decides nothing else.
//
// FACE CONVENTIONS (the same ones kernel/mathtools.js, kernel/funding.js and kernel/publication.js follow):
//   ① every key is read with a LITERAL access - a composed key is invisible to the settings table's scan, and that table
//      is a gate (kernel/guard.js states the same discipline at its head);
//   ② every receipt carries `enforced[]` - the keys EVALUATED for that call - so an auditor can tell which settings the
//      machine actually consulted, and `fired[]` names the ones that CHANGED the outcome;
//   ③ a limit the machine cannot enforce is refused BY NAME rather than warned about;
//   ④ zero declarations ⇒ zero mechanism: nothing is refused and nothing is pretended;
//   ⑤ injected clock only; read-only surfaces never mutate; every truncation is counted.
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

/** Codes this face can throw. Registered in docs/03 §8 (the docs audit recomputes that list independently). */
export const CODE = Object.freeze({
  counterpartyUnknown: 'VMU_COLLAB_COUNTERPARTY_UNKNOWN',
  agreementRequired: 'VMU_COLLAB_AGREEMENT_REQUIRED',
  agreementExpired: 'VMU_COLLAB_AGREEMENT_EXPIRED',
  templateUnknown: 'VMU_COLLAB_TEMPLATE_UNKNOWN',
  settlementPremature: 'VMU_COLLAB_SETTLEMENT_PREMATURE',
  reconciliationOff: 'VMU_COLLAB_RECONCILIATION_OFF',
  // ROUND 219: the agreements family.
  agreementKindUnknown: 'VMU_AGREEMENT_KIND_UNKNOWN',
  agreementUnsigned: 'VMU_AGREEMENT_UNSIGNED',
  signatureRefRequired: 'VMU_AGREEMENT_SIGNATURE_REF_REQUIRED',
  scopeNotCovered: 'VMU_AGREEMENT_SCOPE_NOT_COVERED',
})

export function createCollab({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createCollab needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    agreementRequired: boolOr(sget('vmu.collab.agreementRequired', true), true),
    dataSharingTemplate: str(sget('vmu.collab.dataSharingTemplate')) || 'standard',
    counterpartyRegistry: str(sget('vmu.collab.counterpartyRegistry')) || 'Ops/Partners',
    expiryWarnDays: intOr(sget('vmu.collab.expiryWarnDays', 30), 30),
    jointAuthorshipPolicy: str(sget('vmu.collab.jointAuthorshipPolicy')) || 'contribution-then-alternate',
    settlementCycleDays: (() => { const v = intOr(sget('vmu.collab.settlementCycleDays', 60), 60); return v >= 1 ? v : 60 })(),
    reconciliationToleranceMinor: (() => { const v = intOr(sget('vmu.collab.reconciliationToleranceMinor', 1), 1); return v >= 0 ? v : 1 })(),
    // ROUND 219: the agreements family (docs/22 the agreement-gate table).
    agreementsRegistryDir: str(sget('vmu.agreements.registryDir')) || 'Ops/Agreements',
    agreementKinds: (() => { const a = sget('vmu.agreements.kinds'); return Array.isArray(a) && a.length ? a.map(String) : ['dua', 'mta'] })(),
    unsignedPolicy: ['block', 'warn'].includes(sget('vmu.agreements.unsignedPolicy')) ? sget('vmu.agreements.unsignedPolicy') : 'block',
    signatureRefRequired: sget('vmu.agreements.signatureRefRequired') !== false,
    agreementsExpiryWarnDays: (() => { const v = intOr(sget('vmu.agreements.expiryWarnDays', 30), 30); return v >= 0 ? v : 30 })(),
    reviewCadenceDays: (() => { const v = intOr(sget('vmu.agreements.reviewCadenceDays', 365), 365); return v >= 1 ? v : 365 })(),
    scopeEnforcement: ['block', 'warn'].includes(sget('vmu.agreements.scopeEnforcement')) ? sget('vmu.agreements.scopeEnforcement') : 'block',
  })

  const counterparties = new Map()   // id -> { id, name, institution, templates[], at }
  const agreements = new Map()       // id -> { id, counterparty, template, scope, startsAt, expiresAt, settlement{}, authors[], at }
  let seq = 0
  let dropped = 0
  const nextId = (p) => p + '-' + (++seq)

  /** Register a counterparty. The registry directory is a SETTING (`counterpartyRegistry`) and is reported, not touched. */
  function addCounterparty({ id = null, name = null, institution = null, templates = null } = {}) {
    const c = cfg()
    const realName = str(name)
    if (!realName) throw refuse('VMU_INVALID_ARGUMENT', 'addCounterparty needs a name', 'pass { name: "…" }')
    const realId = str(id) || realName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const list = Array.isArray(templates) && templates.length ? templates.map(String) : [c.dataSharingTemplate]
    // Templates DECLARED on this counterparty that differ from the face default: useful to REPORT, never refused here
    // (the refusal belongs where a template is actually used, in openAgreement).
    const beyondDefault = list.filter((t) => t !== c.dataSharingTemplate)
    const rec = { id: realId, name: realName, institution: str(institution) || null, templates: list, at: clock() }
    counterparties.set(realId, rec)
    return { ok: true, counterparty: { id: rec.id, name: rec.name, institution: rec.institution }, registry: c.counterpartyRegistry, templatesBeyondDefault: beyondDefault, enforced: ['vmu.collab.counterpartyRegistry', 'vmu.collab.dataSharingTemplate'] }
  }

  const counterpartyOf = (id) => {
    const cp = counterparties.get(str(id))
    if (!cp) throw refuse(CODE.counterpartyUnknown, 'unknown counterparty: ' + String(id), 'addCounterparty({name,…}) first, or use a registered id', { id: str(id), known: [...counterparties.keys()].slice(0, 10) })
    return cp
  }

  const expired = (a, at) => Number.isFinite(a.expiresAt) && a.expiresAt > 0 && at >= a.expiresAt
  const daysLeft = (a, at) => (Number.isFinite(a.expiresAt) && a.expiresAt > 0 ? Math.floor((a.expiresAt - at) / 86400000) : null)

  /** Open an agreement. `agreementRequired` gates exchanges and `expiryWarnDays` drives the warning below. */
  function openAgreement({ counterparty, kind = null, template = null, scope = null, startsAt = null, endsAt = null, authors = null } = {}) {
    const c = cfg()
    const cp = counterpartyOf(counterparty)
    // vmu.agreements.kinds: the declared kinds are the only ones this face will open.
    const realKind = str(kind) || c.agreementKinds[0]
    if (!c.agreementKinds.includes(realKind)) {
      throw refuse(CODE.agreementKindUnknown, 'agreement kind is not declared: ' + realKind,
        'allowed: ' + c.agreementKinds.join(', ') + ' (vmu.agreements.kinds)', { kind: realKind, allowed: c.agreementKinds.slice() })
    }
    const tmpl = str(template) || c.dataSharingTemplate
    if (tmpl !== c.dataSharingTemplate && !cp.templates.includes(tmpl)) {
      throw refuse(CODE.templateUnknown, 'template is not agreed with ' + cp.id + ': ' + tmpl,
        'declare it on the counterparty (templates:[…]) or use ' + c.dataSharingTemplate, { counterparty: cp.id, template: tmpl, declared: cp.templates.slice() })
    }
    const at = clock()
    const start = Number.isFinite(startsAt) ? Number(startsAt) : at
    const end = Number.isFinite(endsAt) && Number(endsAt) > 0 ? Number(endsAt) : null
    const id = nextId('agreement')
    const rec = { id, counterparty: cp.id, kind: realKind, template: tmpl, scope: str(scope) || null, startsAt: start, expiresAt: end, authors: Array.isArray(authors) ? authors.map(String) : [], settlements: [], at, jointAuthorshipPolicy: c.jointAuthorshipPolicy,
      signed: null, signatureRef: null, lastReviewedAt: null, reviewWarnings: [] }
    agreements.set(id, rec)
    const left = daysLeft(rec, at)
    const warn = left !== null && left <= c.expiryWarnDays
    if (warn) say({ type: 'collab/expiry-warning', at, agreement: id, daysLeft: left, expiryWarnDays: c.expiryWarnDays })
    return { ok: true, id, counterparty: cp.id, kind: realKind, template: tmpl, expiresAt: end, daysLeft: left, expiryWarning: warn,
      registryDir: c.agreementsRegistryDir, signed: false,
      enforced: ['vmu.collab.agreementRequired', 'vmu.collab.dataSharingTemplate', 'vmu.collab.expiryWarnDays', 'vmu.collab.jointAuthorshipPolicy', 'vmu.agreements.kinds', 'vmu.agreements.registryDir'] }
  }

  const agreementOf = (id) => {
    const a = agreements.get(str(id))
    if (!a) throw refuse('VMU_INVALID_ARGUMENT', 'unknown agreement: ' + String(id), 'openAgreement({counterparty,…}) first', { id: str(id) })
    return a
  }

  /** ROUND 219: sign an agreement. `signatureRefRequired` refuses a signature that carries no reference. */
  function signAgreement({ agreementId, by = null, ref = null } = {}) {
    const c = cfg()
    const a = agreementOf(agreementId)
    const enforced = ['vmu.agreements.signatureRefRequired']
    if (c.signatureRefRequired && !(typeof ref === 'string' && ref.trim())) {
      throw refuse(CODE.signatureRefRequired, 'vmu.agreements.signatureRefRequired=true: a signature needs a reference',
        'pass ref, naming the document or its path (vmu.agreements.signatureRefRequired)', { agreementId: a.id, missing: ['ref'], enforced })
    }
    a.signed = true
    a.signatureRef = ref === null ? null : String(ref)
    a.signedBy = by === null ? null : String(by)
    a.signedAt = clock()
    return { ok: true, agreementId: a.id, signed: true, ref: a.signatureRef, enforced }
  }

  /** ROUND 219: record a review. `reviewCadenceDays` decides when the next one is due. */
  function reviewAgreement({ agreementId } = {}) {
    const a = agreementOf(agreementId)
    const at = clock()
    a.lastReviewedAt = at
    a.reviewWarnings = []
    return { ok: true, agreementId: a.id, reviewedAt: at, cadenceDays: cfg().reviewCadenceDays, nextDueAt: at + cfg().reviewCadenceDays * 86400000, enforced: ['vmu.agreements.reviewCadenceDays'] }
  }

  /**
   * Authorise an exchange (data or otherwise) with a counterparty. This is where `agreementRequired` bites: with it on, an
   * exchange with no live agreement is refused BY NAME; with it off, the face records the decision and pretends nothing.
   */
  function exchange({ counterparty, kind = 'data', agreementId = null, scope = null } = {}) {
    const c = cfg()
    const cp = counterpartyOf(counterparty)
    const at = clock()
    const enforced = ['vmu.collab.agreementRequired', 'vmu.collab.dataSharingTemplate']
    const fired = []
    if (!c.agreementRequired) {
      fired.push('vmu.collab.agreementRequired')
      return { ok: true, allowed: true, counterparty: cp.id, kind: str(kind) || 'data', template: c.dataSharingTemplate, agreement: null, note: 'vmu.collab.agreementRequired=false: the exchange is recorded without an agreement', enforced, fired }
    }
    if (!agreementId) {
      fired.push('vmu.collab.agreementRequired')
      throw refuse(CODE.agreementRequired, 'vmu.collab.agreementRequired=true: an exchange needs an agreement with ' + cp.id,
        'openAgreement({counterparty:"' + cp.id + '"}) first', { counterparty: cp.id, kind: str(kind) || 'data', enforced, fired })
    }
    const a = agreementOf(agreementId)
    if (a.counterparty !== cp.id) throw refuse('VMU_INVALID_ARGUMENT', 'agreement ' + a.id + ' belongs to ' + a.counterparty + ', not ' + cp.id, 'pass the matching agreement', { agreementId: a.id, counterparty: cp.id })
    if (expired(a, at)) {
      fired.push('vmu.collab.expiryWarnDays')
      throw refuse(CODE.agreementExpired, 'the agreement expired at ' + a.expiresAt + ' (now=' + at + ')',
        'renew the agreement before exchanging (vmu.collab.expiryWarnDays=' + c.expiryWarnDays + ')', { agreementId: a.id, expiresAt: a.expiresAt, at, enforced, fired })
    }
    // ROUND 219: this is the only place an agreement is actually USED, so the agreements family is decided here.
    let unsignedWarn = null
    if (!a.signed) {
      if (c.unsignedPolicy === 'block') {
        fired.push('vmu.agreements.unsignedPolicy')
        throw refuse(CODE.agreementUnsigned, 'vmu.agreements.unsignedPolicy=block: the agreement is not signed, so nothing may be shared under it',
          'sign it first with signAgreement, or set the policy to warn deliberately', { agreementId: a.id, enforced: enforced.concat(['vmu.agreements.unsignedPolicy']), fired })
      }
      unsignedWarn = 'unsigned-warn'
      fired.push('vmu.agreements.unsignedPolicy')
    }
    const asked = str(scope)
    if (asked && a.scope && asked !== a.scope) {
      if (c.scopeEnforcement === 'block') {
        fired.push('vmu.agreements.scopeEnforcement')
        throw refuse(CODE.scopeNotCovered, 'the requested scope is outside the agreement: ' + asked + ' vs ' + a.scope,
          'open a separate agreement for that scope, or set vmu.agreements.scopeEnforcement=warn deliberately', { agreementId: a.id, asked, agreed: a.scope, enforced: enforced.concat(['vmu.agreements.scopeEnforcement']), fired })
      }
      a.reviewWarnings.push('scope-warn: ' + asked)
      fired.push('vmu.agreements.scopeEnforcement')
    }
    // An overdue review is REPORTED rather than refused: the declared contract gives the cadence no enforcement of its
    // own, and inventing one would be a decision this face has no authority to take.
    const reviewOverdue = a.lastReviewedAt !== null && (at - a.lastReviewedAt) > c.reviewCadenceDays * 86400000
    const reviewNeverDone = a.lastReviewedAt === null
    return { ok: true, allowed: true, counterparty: cp.id, kind: str(kind) || 'data', template: a.template, agreement: a.id,
      kindDeclared: a.kind, daysLeft: daysLeft(a, at), signed: !!a.signed, unsignedWarn, reviewOverdue, reviewNeverDone,
      reviewWarnings: a.reviewWarnings.slice(), registryDir: c.agreementsRegistryDir,
      enforced: enforced.concat(['vmu.agreements.unsignedPolicy', 'vmu.agreements.scopeEnforcement', 'vmu.agreements.reviewCadenceDays', 'vmu.agreements.registryDir']), fired }
  }

  /**
   * Record a settlement against an agreement. `settlementCycleDays` decides whether the cycle is due, and
   * `reconciliationToleranceMinor` decides whether a stated balance matches within tolerance.
   */
  function settle({ agreementId, amountMinor = 0, periodStart = null, reconciledMinor = null } = {}) {
    const c = cfg()
    const a = agreementOf(agreementId)
    const at = clock()
    const enforced = ['vmu.collab.settlementCycleDays', 'vmu.collab.reconciliationToleranceMinor']
    const fired = []
    const cycle = c.settlementCycleDays * 86400000
    const since = Number.isFinite(periodStart) ? Number(periodStart) : (a.settlements.length ? a.settlements[a.settlements.length - 1].at : a.startsAt)
    if (at - since < cycle) {
      fired.push('vmu.collab.settlementCycleDays')
      throw refuse(CODE.settlementPremature, 'the settlement cycle is not due until ' + (since + cycle) + ' (now=' + at + '); cycle=' + c.settlementCycleDays + 'd',
        'wait for the cycle, or lower vmu.collab.settlementCycleDays', { agreementId: a.id, dueAt: since + cycle, at, cycleDays: c.settlementCycleDays, enforced, fired })
    }
    const amount = Number(amountMinor)
    if (reconciledMinor !== null) {
      const gap = Math.abs(Number(reconciledMinor) - (Number.isFinite(amount) ? amount : 0))
      if (gap > c.reconciliationToleranceMinor) {
        fired.push('vmu.collab.reconciliationToleranceMinor')
        throw refuse(CODE.reconciliationOff, 'reconciliation gap ' + gap + ' exceeds vmu.collab.reconciliationToleranceMinor=' + c.reconciliationToleranceMinor,
          'correct the figure, or raise the tolerance deliberately', { agreementId: a.id, gap, tolerance: c.reconciliationToleranceMinor, enforced, fired })
      }
    }
    const rec = { id: nextId('settlement'), at, amountMinor: Number.isFinite(amount) ? amount : 0, reconciledMinor: reconciledMinor === null ? null : Number(reconciledMinor) }
    a.settlements.push(rec)
    return { ok: true, agreementId: a.id, settlement: rec, cycleDays: c.settlementCycleDays, tolerance: c.reconciliationToleranceMinor, enforced, fired }
  }

  /** Read-only. Joint authorship is ORDERED by the declared policy, and the rule is disclosed rather than implied. */
  function authorship({ agreementId } = {}) {
    const a = agreementOf(agreementId)
    const c = cfg()
    const authors = a.authors.slice()
    return { ok: true, agreementId: a.id, policy: c.jointAuthorshipPolicy, authors,
      note: c.jointAuthorshipPolicy === 'contribution-then-alternate'
        ? 'contribution order first, alternating for equal contributions'
        : 'policy name is not one this face implements: the declared order is returned unchanged',
      enforced: ['vmu.collab.jointAuthorshipPolicy'] }
  }

  /** Read-only views (never mutate; every truncation is counted). */
  const agreementsView = () => {
    const all = [...agreements.values()].map((a) => ({ id: a.id, counterparty: a.counterparty, template: a.template, expiresAt: a.expiresAt, daysLeft: daysLeft(a, clock()), settlements: a.settlements.length }))
    const kept = all.slice(0, listCap)
    return { items: kept, total: all.length, dropped: dropped + (all.length - kept.length) }
  }
  const status = () => {
    const c = cfg()
    return {
      ok: true,
      counterparties: counterparties.size, agreements: agreements.size,
      policy: c,
      jointAuthorshipKnown: c.jointAuthorshipPolicy === 'contribution-then-alternate',
      zeroConfig: counterparties.size === 0 && agreements.size === 0,
      readsArePure: true,
      items: agreementsView().items,
      dropped: agreementsView().dropped,
      at: clock(),
    }
  }

  return { apiVersion, addCounterparty, openAgreement, signAgreement, reviewAgreement, exchange, settle, authorship, agreements: agreementsView, status }
}
