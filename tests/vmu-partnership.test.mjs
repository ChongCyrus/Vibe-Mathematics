// tests/vmu-partnership.test.mjs — the legal-entity face (volume 22 §L285-§L302).
//
// ROUND 276. Written straight from the volume: six declarations, three operations and five named refusals. Run: node tests/vmu-partnership.test.mjs
import { createLegalEntity, DEFAULT_SLOTS } from '../vibe-math-vmu/kernel/partnership.js'

let pass = 0
let fail = 0
const ok = (cond, label, detail) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' -- ' + JSON.stringify(detail))) } }
const throws = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code } } }

const mk = (settings = {}) => createLegalEntity({ clock: () => 1000, settings })
const INV = { taxIdRef: 'r', taxRateRef: 't', taxAmountMinor: 1, taxJurisdiction: 'CN' }

// zero mechanism: nothing declared means nothing happens, and the face says so
{
  const z = mk({})
  const s = z.status()
  ok(s.ok === true && s.zeroMechanism === true && s.entities === 0 && s.bindings === 0, 'zero-mechanism: an empty face reports itself as empty', s)
  ok(JSON.stringify(s.declared) === JSON.stringify(DEFAULT_SLOTS), 'the declared slots default to the volume four')
  ok(s.config.registryDir === 'Ops/Entities' && s.config.requireEntity === true && s.config.taxIdStyle === 'opaque-ref',
    'the defaults are the volume defaults', s.config)
  ok(s.config.crossBorderGate === 'require-approval' && s.config.crossBorderApproverRoles.length === 0, 'the cross-border defaults are the volume ones')
}

// registration, and the opaque-reference discipline
{
  const f = mk({})
  const e = f.registerEntity({ entityId: 'ent-1', jurisdiction: 'CN', taxIdRef: 'ref-1', currency: 'EUR' })
  ok(e.ok === true && e.registryDir === 'Ops/Entities' && e.taxIdRef === 'ref-1', 'registerEntity records the entity and reports the declared dir', e)
  ok(f.registerEntity({ entityId: '' }).code === 'VMU_INVALID_ARGUMENT', 'an entity without an id is refused')
  const plain = f.registerEntity({ entityId: 'e2', taxIdRef: '913100001234567' })
  ok(plain.code === 'VMU_INVALID_ARGUMENT', 'a plaintext-looking tax number is refused, not stored', plain)
  ok(f.registerEntity({ entityId: 'e3', taxIdRef: null }).ok === true, 'an absent tax reference is fine - only a plaintext-looking one is refused')
}

// binding
{
  const f = mk({})
  f.registerEntity({ entityId: 'ent-1' })
  ok(f.bindAccount({ account: '' }).code === 'VMU_ENTITY_ACCOUNT_UNBOUND', 'binding without an account is refused')
  ok(f.bindAccount({ account: 'a1' }).code === 'VMU_ENTITY_ACCOUNT_UNBOUND', 'binding without an entity is refused')
  ok(f.bindAccount({ account: 'a1', entityId: 'nope' }).code === 'VMU_ENTITY_UNKNOWN', 'binding to an unregistered entity is refused by name')
  ok(f.bindAccount({ account: 'a1', entityId: 'ent-1' }).ok === true, 'binding to a registered entity succeeds')
}

// validation: PRESENCE of the declared slots, and nothing about tax rates
{
  const f = mk({})
  f.registerEntity({ entityId: 'ent-1', currency: 'EUR' })
  f.bindAccount({ account: 'a1', entityId: 'ent-1' })
  ok(f.validateInvoice({ account: 'a1', invoice: INV }).ok === true, 'a complete invoice validates')
  const miss = f.validateInvoice({ account: 'a1', invoice: { taxIdRef: 'r' } })
  ok(miss.code === 'VMU_TAX_FIELD_MISSING', 'a missing declared slot is refused by name', miss)
  const gate = f.validateInvoice({ account: 'a1', invoice: Object.assign({ crossBorder: true }, INV) })
  ok(gate.code === 'VMU_CROSSBORDER_GATE_REQUIRED', 'a cross-border invoice without an approver is refused', gate)
  ok(f.validateInvoice({ account: 'a1', invoice: Object.assign({ crossBorder: true, approvedBy: 'cfo' }, INV) }).ok === true,
    'the same invoice with an approver passes')
  const cur = f.validateInvoice({ account: 'a1', invoice: Object.assign({ currency: 'USD' }, INV) })
  ok(cur.code === 'VMU_CROSSBORDER_CURRENCY_MISMATCH', 'a currency that differs from the entity currency is refused', cur)
  const unbound = f.validateInvoice({ account: 'a9', invoice: INV })
  ok(unbound.code === 'VMU_ENTITY_ACCOUNT_UNBOUND', 'an unbound account is refused while requireEntity is on', unbound)
  ok(mk({ 'vmu.partnership.requireEntity': false }).validateInvoice({ account: 'a9', invoice: INV }).ok === true,
    'requireEntity=false lets an unbound account through - the declaration decides')
}

// the declarations decide, and every one of the six is read
{
  const f = mk({ 'vmu.partnership.invoiceTaxSlots': ['taxIdRef'], 'vmu.partnership.crossBorderGate': 'off' })
  f.registerEntity({ entityId: 'ent-1' })
  f.bindAccount({ account: 'a1', entityId: 'ent-1' })
  ok(f.validateInvoice({ account: 'a1', invoice: { taxIdRef: 'r' } }).ok === true, 'a re-declared slot set is what gets checked')
  ok(f.validateInvoice({ account: 'a1', invoice: Object.assign({ crossBorder: true }, { taxIdRef: 'r' }) }).ok === true,
    'crossBorderGate=off means the gate does not fire')
  const used = f.status().keysUsed
  ok(used.length === 6, 'all six declarations are accounted for as read', used)
}

console.log('=== VMU LEGALENTITY: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail > 0) process.exit(1)
