// vibe-math-vmu/kernel/legalentity.js — legal entities and tax FIELD SLOTS (volume 22 §L285-§L302, family N9).
//
// ROUND 276. The volume is unusually specific, so this face is written straight from it:
//   · protocols  LegalEntity { entityId, jurisdiction, taxIdRef, currency? }
//                TaxFieldSlots { slot, required, source }
//   · six keys   registryDir (Ops/Entities), requireEntity (true), taxIdStyle (opaque-ref),
//                invoiceTaxSlots (four slots), crossBorderGate (require-approval), crossBorderApproverRoles ([])
//   · five codes VMU_ENTITY_UNKNOWN, VMU_ENTITY_ACCOUNT_UNBOUND, VMU_TAX_FIELD_MISSING,
//                VMU_CROSSBORDER_GATE_REQUIRED, VMU_CROSSBORDER_CURRENCY_MISMATCH
//   · the method validateInvoice() checks that the declared slots are PRESENT and - as the section says of itself - does NOT judge
//     whether a tax rate is correct. Tax identifiers are stored as opaque references; a plainly formatted tax number is refused.
//
// WHY IT IS ITS OWN FACE (round 275's lesson): the wiring bookkeeping is PER FAMILY. `vmu.partnership.*` is not `vmu.funding.*`, and a
// family's key list asserts its own keys and that the family's own suite reads them. A cross-family key belongs in a family of its own.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

/** The declared slots, verbatim from §L295. */
export const DEFAULT_SLOTS = Object.freeze(['taxIdRef', 'taxRateRef', 'taxAmountMinor', 'taxJurisdiction'])

export function createLegalEntity({ clock = () => 0, log = () => {}, settings = {}, bus = null } = {}) {
  const cfg = () => ({
    registryDir: typeof settings['vmu.partnership.registryDir'] === 'string' && settings['vmu.partnership.registryDir']
      ? settings['vmu.partnership.registryDir'] : 'Ops/Entities',
    requireEntity: settings['vmu.partnership.requireEntity'] !== false,
    taxIdStyle: ['opaque-ref', 'none'].includes(settings['vmu.partnership.taxIdStyle']) ? settings['vmu.partnership.taxIdStyle'] : 'opaque-ref',
    invoiceTaxSlots: Array.isArray(settings['vmu.partnership.invoiceTaxSlots']) && settings['vmu.partnership.invoiceTaxSlots'].length
      ? settings['vmu.partnership.invoiceTaxSlots'].map(String) : DEFAULT_SLOTS.slice(),
    crossBorderGate: ['require-approval', 'warn', 'off'].includes(settings['vmu.partnership.crossBorderGate'])
      ? settings['vmu.partnership.crossBorderGate'] : 'require-approval',
    crossBorderApproverRoles: Array.isArray(settings['vmu.partnership.crossBorderApproverRoles'])
      ? settings['vmu.partnership.crossBorderApproverRoles'].map(String) : [],
  })

  const entities = new Map()
  const bindings = new Map()      // accountId -> entityId
  const counts = { registered: 0, refused: 0, validated: 0 }
  const keysUsed = new Set()

  const say = (row) => { try { log(row) } catch (e) { /* a log seam that throws must not corrupt the face */ } }
  const deny = (code, message, hint, extra) => {
    counts.refused += 1
    say({ type: 'legalentity/refused', at: clock(), code, message })
    return refuse(code, message, hint, extra)
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])

  /** Register a legal entity. `taxIdStyle=opaque-ref` refuses a value that looks like a plaintext tax number. */
  function registerEntity({ entityId = null, jurisdiction = null, taxIdRef = null, currency = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.partnership.registryDir').add('vmu.partnership.taxIdStyle')
    const id = str(entityId).trim()
    if (!id) return deny('VMU_INVALID_ARGUMENT', 'an entity needs entityId', 'pass { entityId, jurisdiction, taxIdRef, currency? }')
    const stored = taxIdRef === null || taxIdRef === undefined ? null : String(taxIdRef)
    if (c.taxIdStyle === 'opaque-ref' && stored && /^[0-9][0-9-]{5,}$/.test(stored)) {
      return deny('VMU_INVALID_ARGUMENT', 'taxIdRef looks like a plaintext tax number',
        'store an opaque reference instead (vmu.partnership.taxIdStyle=opaque-ref; volume 20 owns privacy)')
    }
    const rec = { entityId: id, jurisdiction: str(jurisdiction) || null, taxIdRef: stored, currency: str(currency) || null,
      registryDir: c.registryDir, at: clock() }
    entities.set(id, rec)
    counts.registered += 1
    if (bus && typeof bus.emit === 'function') bus.emit('legalentity/registered', { entityId: id, at: clock() })
    return Object.assign({ ok: true }, rec, { enforced: ['vmu.partnership.registryDir', 'vmu.partnership.taxIdStyle'], enforcedScope: 'evaluated-so-far' })
  }

  /** Bind an account to an entity. An unregistered entity is a NAMED refusal. */
  function bindAccount({ account = null, entityId = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.partnership.requireEntity')
    const acct = str(account).trim()
    if (!acct) return deny('VMU_ENTITY_ACCOUNT_UNBOUND', 'bindAccount needs an account', 'pass { account, entityId }')
    const id = str(entityId).trim()
    if (!id) return deny('VMU_ENTITY_ACCOUNT_UNBOUND', 'no entity given for account ' + acct, 'pass { entityId } (volume 22 §L292)')
    if (!entities.has(id)) return deny('VMU_ENTITY_UNKNOWN', 'entity not registered: ' + id, 'register it with registerEntity() first')
    bindings.set(acct, id)
    return { ok: true, account: acct, entityId: id, requireEntity: c.requireEntity,
      enforced: ['vmu.partnership.requireEntity'], enforcedScope: 'evaluated-so-far' }
  }

  /**
   * The volume names this method (§L298). Every declared slot must be PRESENT; whether a tax rate is correct is explicitly not judged.
   */
  function validateInvoice({ account = null, invoice = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.partnership.invoiceTaxSlots').add('vmu.partnership.crossBorderGate').add('vmu.partnership.crossBorderApproverRoles')
    const inv = invoice && typeof invoice === 'object' ? invoice : {}
    const missing = c.invoiceTaxSlots.filter((s) => inv[s] === undefined || inv[s] === null || inv[s] === '')
    if (missing.length) {
      return deny('VMU_TAX_FIELD_MISSING', 'invoice is missing declared tax slot(s): ' + missing.join(', '),
        'the declared slots are vmu.partnership.invoiceTaxSlots; this check is about PRESENCE, not about tax rates',
        { missing, slots: c.invoiceTaxSlots.slice() })
    }
    const crossBorder = inv.crossBorder === true
    if (crossBorder && c.crossBorderGate === 'require-approval' && !inv.approvedBy) {
      return deny('VMU_CROSSBORDER_GATE_REQUIRED', 'a cross-border invoice needs an approver',
        'pass approvedBy from ' + (c.crossBorderApproverRoles.length ? c.crossBorderApproverRoles.join('/') : 'vmu.partnership.crossBorderApproverRoles'))
    }
    const acct = str(account).trim()
    const boundId = acct ? bindings.get(acct) || null : null
    const entity = boundId ? entities.get(boundId) || null : null
    if (acct && c.requireEntity && !entity) {
      keysUsed.add('vmu.partnership.requireEntity')
      return deny('VMU_ENTITY_ACCOUNT_UNBOUND', 'account ' + acct + ' has no bound legal entity',
        'bindAccount({account, entityId}) first (vmu.partnership.requireEntity=true)')
    }
    if (entity && entity.currency && inv.currency && String(inv.currency) !== entity.currency) {
      return deny('VMU_CROSSBORDER_CURRENCY_MISMATCH', 'invoice currency ' + String(inv.currency) + ' differs from the entity currency ' + entity.currency,
        'declare the invoice in the entity currency, or register an entity for it')
    }
    counts.validated += 1
    return { ok: true, account: acct || null, entityId: entity ? entity.entityId : null, slots: c.invoiceTaxSlots.slice(),
      crossBorder, approvedBy: inv.approvedBy || null, crossBorderGate: c.crossBorderGate,
      enforced: ['vmu.partnership.invoiceTaxSlots', 'vmu.partnership.crossBorderGate'], enforcedScope: 'evaluated-so-far' }
  }

  /** Read-only views. Every declaration this face read is named, so a reader can see WHICH keys had an effect. */
  const entityView = (id) => { const e = entities.get(str(id)); return e ? Object.assign({}, e) : null }
  const list = () => ({ entities: [...entities.values()].map((e) => Object.assign({}, e)), bindings: Object.fromEntries([...bindings.entries()]) })
  const status = () => ({
    ok: true,
    apiVersion,
    config: cfg(),
    entities: entities.size,
    bindings: bindings.size,
    counts: Object.assign({}, counts),
    keysUsed: [...keysUsed].sort(),
    declared: cfg().invoiceTaxSlots.slice(),
    zeroMechanism: entities.size === 0,
  })
  const trail = () => Object.assign({}, counts)

  return { apiVersion, registerEntity, bindAccount, validateInvoice, entityView, list, status, trail, keysUsed: () => [...keysUsed].sort() }
}
