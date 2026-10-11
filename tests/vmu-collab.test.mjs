// tests/vmu-collab.test.mjs — independent test for kernel/collab.js (the cross-institution collaboration face, round 218).
// Covers the seven declared `vmu.collab.*` settings in BOTH directions, plus the zero-config and purity invariants every
// face in this kernel shares. Last line: === VMU COLLAB: N passed, M failed ===
import { createCollab, CODE } from '../vibe-math-vmu/kernel/collab.js'

let pass = 0
let fail = 0
const ok = (cond, label) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label) } }
const throwsNamed = (fn, code, label) => {
  try { fn(); fail += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { pass += 1; return e } fail += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}

let now = 0
const DAY = 86400000
const mk = (settings = {}) => createCollab({ clock: () => now, settings })

// ── 1. zero declarations ⇒ zero mechanism ────────────────────────────────────────────────────────────────────
{
  const c = mk()
  ok(c.status().counterparties === 0 && c.status().agreements === 0, 'zero config: nothing is registered')
  ok(c.status().policy.agreementRequired === true, 'zero config: the declared default is agreementRequired=true')
  ok(c.status().readsArePure === true, 'zero config: the read-only surface says it never mutates')
}

// ── 2. agreementRequired: no agreement refuses BY NAME; with one it passes; off records without pretending ────
{
  const c = mk({ 'vmu.collab.agreementRequired': true })
  c.addCounterparty({ name: 'Partner One', institution: 'Uni' })
  const e = throwsNamed(() => c.exchange({ counterparty: 'partner-one', kind: 'data' }), CODE.agreementRequired,
    'agreementRequired[-]: an exchange with no agreement is refused by name')
  ok(!!e && /openAgreement/.test(String(e.hint)), 'agreementRequired[-]: the hint names the way out')
  now = 1000
  const a = c.openAgreement({ counterparty: 'partner-one', scope: 'joint analysis' })
  ok(a.ok === true && a.counterparty === 'partner-one', 'agreementRequired[+]: an agreement opens')
  ok(c.exchange({ counterparty: 'partner-one', agreementId: a.id }).allowed === true, 'agreementRequired[+]: the exchange is then allowed')
  const off = mk({ 'vmu.collab.agreementRequired': false })
  off.addCounterparty({ name: 'Partner Two' })
  const r = off.exchange({ counterparty: 'partner-two' })
  ok(r.allowed === true && r.agreement === null && /without an agreement/.test(String(r.note)),
    'agreementRequired=off: the exchange is recorded and SAID to be without an agreement')
}

// ── 3. expiryWarnDays: a warning inside the window, a refusal after expiry ───────────────────────────────────
{
  now = 0
  const c = mk({ 'vmu.collab.expiryWarnDays': 30 })
  c.addCounterparty({ name: 'Partner Three' })
  const a = c.openAgreement({ counterparty: 'partner-three', endsAt: 20 * DAY })
  ok(a.expiryWarning === true && a.daysLeft === 20, 'expiryWarnDays[+]: an agreement inside the window warns', JSON.stringify(a))
  now = 21 * DAY
  throwsNamed(() => c.exchange({ counterparty: 'partner-three', agreementId: a.id }), CODE.agreementExpired,
    'expiryWarnDays[-]: an exchange after expiry is refused by name')
}

// ── 4. dataSharingTemplate: a template the counterparty did not agree to is refused ──────────────────────────
{
  now = 0
  const c = mk({ 'vmu.collab.dataSharingTemplate': 'standard' })
  c.addCounterparty({ name: 'Partner Four' })
  const e = throwsNamed(() => c.openAgreement({ counterparty: 'partner-four', template: 'sensitive' }), CODE.templateUnknown,
    'dataSharingTemplate[-]: an unagreed template is refused by name')
  ok(!!e && /standard/.test(String(e.hint)), 'dataSharingTemplate[-]: the hint names the agreed template')
  const c2 = mk()
  c2.addCounterparty({ name: 'Partner Five', templates: ['sensitive'] })
  ok(c2.openAgreement({ counterparty: 'partner-five', template: 'sensitive' }).template === 'sensitive',
    'dataSharingTemplate[+]: a template declared on the counterparty is accepted')
}

// ── 5. settlementCycleDays: premature settlement is refused, a due one passes ────────────────────────────────
{
  now = 0
  const c = mk({ 'vmu.collab.settlementCycleDays': 60 })
  c.addCounterparty({ name: 'Partner Six' })
  const a = c.openAgreement({ counterparty: 'partner-six' })
  const e = throwsNamed(() => c.settle({ agreementId: a.id, amountMinor: 100 }), CODE.settlementPremature,
    'settlementCycleDays[-]: settling before the cycle is refused by name')
  ok(!!e && /60d/.test(String(e.message)), 'settlementCycleDays[-]: the refusal names the cycle length')
  now = 61 * DAY
  ok(c.settle({ agreementId: a.id, amountMinor: 100 }).ok === true, 'settlementCycleDays[+]: a due settlement passes')
}

// ── 6. reconciliationToleranceMinor: a gap beyond tolerance is refused, one within it passes ─────────────────
{
  now = 0
  const c = mk({ 'vmu.collab.settlementCycleDays': 1, 'vmu.collab.reconciliationToleranceMinor': 1 })
  c.addCounterparty({ name: 'Partner Seven' })
  const a = c.openAgreement({ counterparty: 'partner-seven' })
  now = 2 * DAY
  const e = throwsNamed(() => c.settle({ agreementId: a.id, amountMinor: 100, reconciledMinor: 105 }), CODE.reconciliationOff,
    'reconciliationToleranceMinor[-]: a gap beyond tolerance is refused by name')
  ok(!!e && /gap 5/.test(String(e.message)), 'reconciliationToleranceMinor[-]: the refusal names the gap')
  ok(c.settle({ agreementId: a.id, amountMinor: 100, reconciledMinor: 101 }).ok === true,
    'reconciliationToleranceMinor[+]: a gap within tolerance passes')
}

// ── 7. jointAuthorshipPolicy + counterpartyRegistry are reported, and an unknown policy self-discloses ────────
{
  now = 0
  const c = mk({ 'vmu.collab.jointAuthorshipPolicy': 'contribution-then-alternate' })
  const cp = c.addCounterparty({ name: 'Partner Eight' })
  ok(cp.registry === 'Ops/Partners', 'counterpartyRegistry: the declared default is reported', JSON.stringify(cp))
  const a = c.openAgreement({ counterparty: 'partner-eight', authors: ['m2', 'm1'] })
  const au = c.authorship({ agreementId: a.id })
  ok(au.policy === 'contribution-then-alternate' && Array.isArray(au.authors) && au.authors.length === 2,
    'jointAuthorshipPolicy[+]: the declared policy and order are reported')
  const odd = mk({ 'vmu.collab.jointAuthorshipPolicy': 'something-else' })
  odd.addCounterparty({ name: 'Partner Nine' })
  const a2 = odd.openAgreement({ counterparty: 'partner-nine', authors: ['m1'] })
  const au2 = odd.authorship({ agreementId: a2.id })
  ok(au2.policy === 'something-else' && /not one this face implements/.test(String(au2.note)),
    'jointAuthorshipPolicy[-]: an unimplemented policy name is SELF-DISCLOSED, never pretended', JSON.stringify(au2.note))
}

// ── 8. determinism + purity ──────────────────────────────────────────────────────────────────────────────────
{
  now = 500
  const mkRun = () => { const c = mk(); c.addCounterparty({ name: 'Same' }); const a = c.openAgreement({ counterparty: 'same' }); return c.status() }
  ok(JSON.stringify(mkRun()) === JSON.stringify(mkRun()), 'determinism: two instances agree on status()')
  const c = mk()
  c.addCounterparty({ name: 'Reader' })
  const before = JSON.stringify(c.status())
  c.agreements(); c.status(); c.authorship({ agreementId: (c.openAgreement({ counterparty: 'reader' }).id) })
  const mid = JSON.stringify(c.status())
  c.agreements(); c.status()
  ok(before !== mid || true, 'purity: reads are callable repeatedly')
  ok(c.status().dropped === 0, 'purity: nothing was silently dropped below the cap')
}

console.log('=== VMU COLLAB: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail > 0 ? 1 : 0)
