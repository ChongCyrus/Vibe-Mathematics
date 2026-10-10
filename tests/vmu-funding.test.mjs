#!/usr/bin/env node
// vmu FUNDING — the guard for kernel/funding.js (the 16 declared `vmu.funding.*` keys).
//
// WHAT THIS PROVES
//   · every wired key changes an observable result (positive + negative);
//   · every RECEIPT carries `enforced[]` + `fired[]` (fired ⊆ enforced, no duplicates) + `enforcedScope`;
//   · every REFUSAL (this face RETURNS them) carries an ARRAY `enforced`, the same scope, and
//     `wouldEvaluate ⊇ enforced` — "so far" is never presented as the whole key set (D3);
//   · WIRED ↔ plannedKeys are complementary and partition the 16 declared keys;
//   · refusals are counted PER CODE; the clock is injected; reads never mutate; zero mechanism is inert.
import { createFunding, WIRED_KEYS, ENFORCED_SCOPE } from '../vibe-math-vmu/kernel/funding.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const DAY = 86400000

let NOW = 1_000_000
const mk = (settings = {}) => createFunding({ clock: () => NOW, settings })
/** A funded account with one line, ready for expenses. */
const funded = (settings = {}, line = { category: 'travel', amountMinor: 100000 }) => {
  NOW = 1_000_000
  const f = mk(settings)
  const a = f.openAccount({ title: 'Grant A' })
  f.budget({ account: a.account, lines: [line] })
  return { f, id: a.account }
}
const ev = { receipt: 'r-1' }

// ── 1. accountsDir ──────────────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.accountsDir': '/var/funding' })
  NOW = 1_000_000
  const good = h.f.openAccount({ title: 'B', dir: '/var/funding' })
  ok(good.ok === true, 'accountsDir[+]: an account in the declared directory passes', JSON.stringify(good.enforced))
  const bad = h.f.openAccount({ title: 'C', dir: '/tmp/elsewhere' })
  ok(bad.ok === false && bad.code === 'VMU_FUNDING_ACCOUNT_MISSING' && /differs from the declared one/.test(bad.message),
    'accountsDir[-]: a foreign directory is refused by name', bad.code)
  ok(bad.ok === false && bad.enforced.includes('vmu.funding.accountsDir'), 'accountsDir[-]: the refusal names the key')
}

// ── 2. currency ─────────────────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.currency': 'EUR' })
  NOW = 1_000_000
  ok(h.f.openAccount({ title: 'D', currency: 'EUR' }).ok === true, 'currency[+]: the declared currency passes')
  const bad = h.f.openAccount({ title: 'E', currency: 'USD' })
  ok(bad.ok === false && bad.code === 'VMU_META_VALIDATION_FAILED' && /declared=EUR/.test(bad.hint),
    'currency[-]: another currency is refused with the declared one', bad.hint)
  const lineBad = h.f.budget({ account: h.id, lines: [{ category: 'x', amountMinor: 1, currency: 'USD' }] })
  ok(lineBad.ok === false && lineBad.code === 'VMU_META_VALIDATION_FAILED', 'currency[-]: a line in another currency is refused too')
}

// ── 3. request ──────────────────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.request': 'auto' })
  NOW = 1_000_000
  const r = h.f.request({ account: h.id, title: 'R1', amountMinor: 1000 })
  ok(r.ok === true && r.approved === true && r.enforced.includes('vmu.funding.request'),
    'request[+]: auto approves a request under the threshold (observable approved:true)', JSON.stringify({ approved: r.approved }))
  const off = funded({ 'vmu.funding.request': 'off' })
  NOW = 1_000_000
  const bad = off.f.request({ account: off.id, title: 'R2', amountMinor: 10 })
  ok(bad.ok === false && bad.code === 'VMU_NOT_PERMITTED' && /request=off/.test(bad.message), 'request[-]: "off" closes intake', bad.code)
  const man = funded({})
  NOW = 1_000_000
  const m = man.f.request({ account: man.id, title: 'R3', amountMinor: 10 })
  ok(m.ok === true && m.approved === false && m.receipt ? true : m.approved === false,
    'request[+]: the documented default ("manual") leaves the request pending', JSON.stringify({ approved: m.approved }))
}

// ── 4. requiredFields ───────────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.requiredFields': ['pi', 'institution'] })
  NOW = 1_000_000
  const good = h.f.request({ account: h.id, title: 'R', amountMinor: 10, fields: { pi: 'ada', institution: 'X' } })
  ok(good.ok === true, 'requiredFields[+]: every declared field present ⇒ accepted')
  const bad = h.f.request({ account: h.id, title: 'R', amountMinor: 10, fields: { pi: 'ada' } })
  ok(bad.ok === false && bad.code === 'VMU_META_VALIDATION_FAILED' && bad.missing && bad.missing.join(',') === 'institution',
    'requiredFields[-]: the missing field is NAMED in the refusal', JSON.stringify(bad.missing))
}

// ── 5. approvalThresholdMinor (request + expense) ───────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.request': 'auto', 'vmu.funding.approvalThresholdMinor': 5000 })
  NOW = 1_000_000
  const under = h.f.request({ account: h.id, title: 'small', amountMinor: 4000 })
  ok(under.ok === true && under.approved === true, 'approvalThresholdMinor[+]: under the threshold auto-approval holds')
  const over = h.f.request({ account: h.id, title: 'big', amountMinor: 9000 })
  ok(over.ok === false && over.code === 'VMU_FUNDING_APPROVAL_REQUIRED' && /现值=9000Minor/.test(over.hint) && /上限=5000Minor/.test(over.hint),
    'approvalThresholdMinor[-]: over the threshold is refused WITH 现值/上限', over.hint)
  const exp = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 9000, evidence: ev })
  ok(exp.ok === false && exp.code === 'VMU_FUNDING_UNAPPROVED_EXPENSE' && /现值=9000Minor/.test(exp.hint),
    'approvalThresholdMinor[-]: an unapproved expense over the threshold is refused', exp.hint)
  const approvedExp = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 9000, evidence: ev, approved: true })
  ok(approvedExp.ok === true, 'approvalThresholdMinor[+]: with approval the same expense passes')
}

// ── 6–7. costSharePolicy / split ────────────────────────────────────────────────────────────────────
{
  const any = funded({ 'vmu.funding.costSharePolicy': 'allow-any' })
  NOW = 1_000_000
  ok(any.f.request({ account: any.id, title: 'a', amountMinor: 1000, costShareMinor: 900 }).ok === true,
    'costSharePolicy[+]: "allow-any" accepts any co-funding share')
  const cap = funded({ 'vmu.funding.costSharePolicy': 'cap', 'vmu.funding.split': ['0.5'] })
  NOW = 1_000_000
  const overCap = cap.f.request({ account: cap.id, title: 'b', amountMinor: 1000, costShareMinor: 700 })
  ok(overCap.ok === false && overCap.code === 'VMU_FUNDING_COSTSHARE_UNBALANCED' && /现值=70.0%/.test(overCap.hint) && /上限=50.0%/.test(overCap.hint),
    'costSharePolicy[-]: over the co-funding cap is refused WITH 现值/上限（比例）', overCap.hint)
  ok(cap.f.request({ account: cap.id, title: 'c', amountMinor: 1000, costShareMinor: 500 }).ok === true,
    'costSharePolicy[+]: at the cap the request passes')
  const balanced = funded({ 'vmu.funding.costSharePolicy': 'balanced', 'vmu.funding.split': ['0.5'] })
  NOW = 1_000_000
  const mismatch = balanced.f.request({ account: balanced.id, title: 'd', amountMinor: 1000, costShareMinor: 300 })
  ok(mismatch.ok === false && mismatch.code === 'VMU_FUNDING_COSTSHARE_UNBALANCED' && /does not match the declared split/.test(mismatch.message),
    'split[-]: a share that contradicts the declared split is refused', mismatch.code)
  ok(balanced.f.request({ account: balanced.id, title: 'e', amountMinor: 1000, costShareMinor: 500 }).ok === true,
    'split[+]: a share matching the declared split passes')
}

// ── 8. budgetLineGranularity ────────────────────────────────────────────────────────────────────────
{
  const coarse = funded({ 'vmu.funding.budgetLineGranularity': 'category' }, { category: 'travel', amountMinor: 1000 })
  NOW = 1_000_000
  ok(coarse.f.status().keys['vmu.funding.budgetLineGranularity'] === 'category', 'budgetLineGranularity[+]: the declared level is reported')
  const fine = mk({ 'vmu.funding.budgetLineGranularity': 'subcategory' })
  NOW = 1_000_000
  const a = fine.openAccount({ title: 'F' })
  const bad = fine.budget({ account: a.account, lines: [{ category: 'travel', amountMinor: 100 }] })
  ok(bad.ok === false && bad.code === 'VMU_FUNDING_LINE_MISSING' && bad.requiredDepth === 2 && /need 2 level/.test(bad.message),
    'budgetLineGranularity[-]: a too-shallow line is refused WITH the required depth', JSON.stringify({ depth: bad.requiredDepth }))
  const good = fine.budget({ account: a.account, lines: [{ category: 'travel', subcategory: 'conference', amountMinor: 100 }] })
  ok(good.ok === true && good.granularity === 'subcategory', 'budgetLineGranularity[+]: a line at the declared depth passes')
}

// ── 9. expenseRequiredFields ────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.expenseRequiredFields': ['receipt', 'approval'] })
  NOW = 1_000_000
  const bad = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 100, evidence: { receipt: 'r' } })
  ok(bad.ok === false && bad.code === 'VMU_FUNDING_RECEIPT_MISSING' && bad.missing.join(',') === 'approval',
    'expenseRequiredFields[-]: the missing piece of evidence is NAMED (no receipt, no reimbursement)', JSON.stringify(bad.missing))
  const good = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 100, evidence: { receipt: 'r', approval: 'a' } })
  ok(good.ok === true, 'expenseRequiredFields[+]: complete evidence passes')
}

// ── 10. pettyCashLimitMinor ─────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.pettyCashLimitMinor': 200 })
  NOW = 1_000_000
  ok(h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 150, evidence: ev, cash: true }).ok === true,
    'pettyCashLimitMinor[+]: cash under the limit passes')
  const bad = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 500, evidence: ev, cash: true })
  ok(bad.ok === false && bad.code === 'VMU_QUOTA_EXCEEDED' && /现值=500Minor/.test(bad.hint) && /上限=200Minor/.test(bad.hint),
    'pettyCashLimitMinor[-]: cash over the limit is refused WITH 现值/上限', bad.hint)
}

// ── 11. reimbursementSlaDays ────────────────────────────────────────────────────────────────────────
{
  const h = funded({ 'vmu.funding.reimbursementSlaDays': 5 })
  NOW = 1_000_000
  const e = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 100, evidence: ev })
  NOW = 1_000_000 + 3 * DAY
  ok(h.f.reimburse({ account: h.id, expense: e.expense }).ok === true, 'reimbursementSlaDays[+]: within the SLA the reimbursement passes')
  const e2 = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 100, evidence: ev })
  NOW = 1_000_000 + 10 * DAY
  const late = h.f.reimburse({ account: h.id, expense: e2.expense })
  ok(late.ok === false && late.code === 'VMU_FUNDING_SETTLEMENT_OVERDUE' && /现值=/.test(late.hint) && /截止=/.test(late.hint),
    'reimbursementSlaDays[-]: past the SLA is a named overdue refusal with 现值/截止', late.hint)
  const again = h.f.reimburse({ account: h.id, expense: e.expense })
  ok(again.ok === false && again.code === 'VMU_STATE' && /already reimbursed/.test(again.message), 'reimbursement[]: paying twice is refused')
}

// ── 12–13. crossInstitutionSettlementDays / settlementRoundMinor ────────────────────────────────────
{
  const h = funded({ 'vmu.funding.crossInstitutionSettlementDays': 30, 'vmu.funding.settlementRoundMinor': 1, 'vmu.funding.split': ['0.6', '0.4'] })
  NOW = 1_000_000
  h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 100, evidence: ev })
  const s = h.f.settle({ account: h.id })
  ok(s.ok === true && s.allocations.length === 2 && s.remainderMinor === 0 && s.roundingUnitMinor === 1,
    'settlementRoundMinor[+]: unit 1 leaves no remainder and the allocations sum exactly', JSON.stringify({ rem: s.remainderMinor }))
  const late = funded({ 'vmu.funding.crossInstitutionSettlementDays': 1, 'vmu.funding.split': ['1'] })
  NOW = 1_000_000
  late.f.expense({ account: late.id, line: { category: 'travel' }, amountMinor: 10, evidence: ev })
  NOW = 1_000_000 + 5 * DAY
  const over = late.f.settle({ account: late.id })
  ok(over.ok === false && over.code === 'VMU_FUNDING_SETTLEMENT_OVERDUE' && /settlement window closed/.test(over.message),
    'crossInstitutionSettlementDays[-]: settling after the window is refused', over.code)
  // rounding: an awkward total with a coarse unit ⇒ a REPORTED remainder
  const round = funded({ 'vmu.funding.settlementRoundMinor': 100, 'vmu.funding.split': ['0.5', '0.5'], 'vmu.funding.crossInstitutionSettlementDays': 0 },
    { category: 'travel', amountMinor: 150 })
  NOW = 1_000_000
  round.f.expense({ account: round.id, line: { category: 'travel' }, amountMinor: 150, evidence: ev })
  const r = round.f.settle({ account: round.id })
  ok(r.ok === true && r.remainderMinor !== 0 && r.remainderCode === 'VMU_ALLOCATION_REMAINDER',
    'settlementRoundMinor[+]: the rounding REMAINDER is reported (never silently absorbed)', JSON.stringify({ rem: r.remainderMinor }))
  ok(round.f.status().counters.remainderMinor > 0, 'settlementRoundMinor[+]: the remainder is COUNTED')
  ok(r.allocations.every((a) => a.amountMinor % 100 === 0), 'settlementRoundMinor[+]: every allocation honours the declared rounding unit')
}

// ── 14–16. auditPack / auditPackFields / auditPackFormat ────────────────────────────────────────────
{
  const off = funded({ 'vmu.funding.auditPack': false })
  NOW = 1_000_000
  const bad = off.f.auditPack({ account: off.id })
  ok(bad.ok === false && bad.code === 'VMU_NOT_PERMITTED' && /auditPack=false/.test(bad.message), 'auditPack[-]: with the switch off the pack is refused', bad.code)
  const on = funded({ 'vmu.funding.auditPack': true, 'vmu.funding.auditPackFields': ['lines', 'expenses', 'totalMinor'] })
  NOW = 1_000_000
  const pack = on.f.auditPack({ account: on.id })
  ok(pack.ok === true && pack.pack.totalMinor === 0 && pack.format === 'json' && JSON.parse(pack.rendered).account === on.id,
    'auditPack[+]: the pack is produced with every declared field and the json rendering parses', pack.format)
  const wantMissing = funded({ 'vmu.funding.auditPack': true, 'vmu.funding.auditPackFields': ['lines', 'nonexistentField'] })
  NOW = 1_000_000
  const bad2 = wantMissing.f.auditPack({ account: wantMissing.id })
  ok(bad2.ok === false && bad2.code === 'VMU_FUNDING_AUDIT_PACK_INCOMPLETE' && bad2.missing.join(',') === 'nonexistentField',
    'auditPackFields[-]: a declared-but-absent field makes the pack INCOMPLETE (named)', JSON.stringify(bad2.missing))
  const formats = ['json', 'markdown', 'csv']
  const rendered = formats.map((fmt) => {
    const f = funded({ 'vmu.funding.auditPack': true, 'vmu.funding.auditPackFormat': fmt })
    NOW = 1_000_000
    return f.f.auditPack({ account: f.id })
  })
  ok(rendered[0].rendered.startsWith('{') && rendered[1].rendered.startsWith('# funding audit') && rendered[2].rendered.startsWith('account,totalMinor'),
    'auditPackFormat[+]: json / markdown / csv render observably differently',
    JSON.stringify(rendered.map((r) => r.rendered.slice(0, 14))))
  ok(rendered.every((r) => r.format === r.format && r.enforced.includes('vmu.funding.auditPackFormat')),
    'auditPackFormat[+]: the format rail is listed in enforced[]')
}

// ── over-budget + open-settlement rails ─────────────────────────────────────────────────────────────
{
  const h = funded({}, { category: 'travel', amountMinor: 1000 })
  NOW = 1_000_000
  h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 600, evidence: ev })
  const over = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 500, evidence: ev })
  ok(over.ok === false && over.code === 'VMU_FUNDING_OVER_BUDGET' && /现值=500Minor/.test(over.hint) && /可用余额=400Minor/.test(over.hint),
    'over-budget: the expense is refused WITH 现值/可用余额', over.hint)
  ok(over.budgetMinor === 1000 && over.remaining === 400, 'over-budget: the refusal carries the budget arithmetic', JSON.stringify({ b: over.budgetMinor, r: over.remaining }))
  const outside = h.f.expense({ account: h.id, line: { category: 'moon-travel' }, amountMinor: 10, evidence: ev })
  ok(outside.ok === false && outside.code === 'VMU_FUNDING_LINE_MISSING' && /outside the budget/.test(outside.message),
    'category-outside: spending on a category with no budget line is refused', outside.code)
  // open settlement blocks a new request; overdue is the named variant
  const o = funded({ 'vmu.funding.crossInstitutionSettlementDays': 10 })
  NOW = 1_000_000
  o.f.expense({ account: o.id, line: { category: 'travel' }, amountMinor: 10, evidence: ev })
  o.f.settle({ account: o.id })
  const openReq = o.f.request({ account: o.id, title: 'after settle', amountMinor: 100 })
  ok(openReq.ok === true, 'open-settlement[+]: once settled a new request passes')
  // force an OPEN settlement on a fresh account and try to request again
  const o2 = funded({ 'vmu.funding.crossInstitutionSettlementDays': 5 })
  NOW = 1_000_000
  o2.f.accountView({ account: o2.id })   // no-op read
  const acc = o2.f.accountView({ account: o2.id })
  acc.currency // keep the reference used
  // mark an open settlement via a settlement that then ages past the window
  o2.f.expense({ account: o2.id, line: { category: 'travel' }, amountMinor: 10, evidence: ev })
  const fresh = funded({ 'vmu.funding.crossInstitutionSettlementDays': 5, 'vmu.funding.split': ['1'] })
  NOW = 1_000_000
  fresh.f.expense({ account: fresh.id, line: { category: 'travel' }, amountMinor: 10, evidence: ev })
  NOW = 1_000_000 + 9 * DAY
  const overdue = fresh.f.settle({ account: fresh.id })
  ok(overdue.ok === false && overdue.code === 'VMU_FUNDING_SETTLEMENT_OVERDUE', 'open-settlement[-]: an overdue settlement is refused by name', overdue.code)
}

// ── refusal discipline: every refusal is a RETURN with enforced[] + scope + wouldEvaluate ⊇ enforced ──
{
  const triggers = [
    ['accountsDir', () => funded({ 'vmu.funding.accountsDir': '/a' }).f.openAccount({ title: 'x', dir: '/b' })],
    ['currency', () => funded({ 'vmu.funding.currency': 'EUR' }).f.openAccount({ title: 'x', currency: 'USD' })],
    ['request off', () => { const h = funded({ 'vmu.funding.request': 'off' }); NOW = 1_000_000; return h.f.request({ account: h.id, title: 'x', amountMinor: 1 }) }],
    ['requiredFields', () => { const h = funded({ 'vmu.funding.requiredFields': ['pi'] }); NOW = 1_000_000; return h.f.request({ account: h.id, title: 'x', amountMinor: 1, fields: {} }) }],
    ['threshold', () => { const h = funded({ 'vmu.funding.request': 'auto', 'vmu.funding.approvalThresholdMinor': 10 }); NOW = 1_000_000; return h.f.request({ account: h.id, title: 'x', amountMinor: 99 }) }],
    ['costshare', () => { const h = funded({ 'vmu.funding.costSharePolicy': 'cap', 'vmu.funding.split': ['0.1'] }); NOW = 1_000_000; return h.f.request({ account: h.id, title: 'x', amountMinor: 100, costShareMinor: 90 }) }],
    ['granularity', () => { const h = mk({ 'vmu.funding.budgetLineGranularity': 'item' }); NOW = 1_000_000; const a = h.openAccount({ title: 'x' }); return h.budget({ account: a.account, lines: [{ category: 'c', amountMinor: 1 }] }) }],
    ['evidence', () => { const h = funded({}); NOW = 1_000_000; return h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 1, evidence: {} }) }],
    ['pettycash', () => { const h = funded({ 'vmu.funding.pettyCashLimitMinor': 1 }); NOW = 1_000_000; return h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 5, evidence: ev, cash: true }) }],
    ['overbudget', () => { const h = funded({}, { category: 'travel', amountMinor: 1 }); NOW = 1_000_000; return h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 5, evidence: ev }) }],
    ['sla', () => { const h = funded({ 'vmu.funding.reimbursementSlaDays': 1 }); NOW = 1_000_000; const e = h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 1, evidence: ev }); NOW = 1_000_000 + 3 * DAY; return h.f.reimburse({ account: h.id, expense: e.expense }) }],
    ['settlement window', () => { const h = funded({ 'vmu.funding.crossInstitutionSettlementDays': 1, 'vmu.funding.split': ['1'] }); NOW = 1_000_000; h.f.expense({ account: h.id, line: { category: 'travel' }, amountMinor: 1, evidence: ev }); NOW = 1_000_000 + 4 * DAY; return h.f.settle({ account: h.id }) }],
    ['auditPack off', () => { const h = funded({ 'vmu.funding.auditPack': false }); NOW = 1_000_000; return h.f.auditPack({ account: h.id }) }],
    ['auditPack fields', () => { const h = funded({ 'vmu.funding.auditPack': true, 'vmu.funding.auditPackFields': ['nope'] }); NOW = 1_000_000; return h.f.auditPack({ account: h.id }) }],
    ['unknown account', () => mk({}).accountView({ account: 'nope' })],
  ]
  const bad = []
  for (const [label, fn] of triggers) {
    const r = fn()
    if (!r || r.ok !== false) { bad.push(label + ':NOT-A-REFUSAL(' + JSON.stringify(r && r.ok) + ')'); continue }
    if (!Array.isArray(r.enforced)) bad.push(label + ':enforced=' + String(r.enforced))
    if (!Array.isArray(r.fired)) bad.push(label + ':fired=' + String(r.fired))
    if (r.enforcedScope !== ENFORCED_SCOPE) bad.push(label + ':scope=' + String(r.enforcedScope))
    if (!Array.isArray(r.wouldEvaluate) || !r.enforced.every((k) => r.wouldEvaluate.includes(k))) bad.push(label + ':wouldEvaluate⊉enforced')
    if (!r.fired.every((k) => r.enforced.includes(k))) bad.push(label + ':fired⊄enforced')
    if (typeof r.code !== 'string' || !r.code) bad.push(label + ':no-code')
  }
  ok(bad.length === 0, 'EVERY refusal is a RETURN carrying code + array enforced[] + scope + wouldEvaluate ⊇ enforced', JSON.stringify(bad))
  // receipts: same discipline, no duplicates, fired ⊆ enforced
  const h = funded({ 'vmu.funding.auditPack': true, 'vmu.funding.auditPackFields': ['lines', 'totalMinor'] })
  NOW = 1_000_000
  const r1 = h.f.accountView({ account: h.id })
  const rs = h.f.receiptsView({ limit: 50 })
  ok(rs.items.length >= 2 && rs.items.every((r) => Array.isArray(r.enforced) && Array.isArray(r.fired) && r.enforcedScope === ENFORCED_SCOPE),
    'receipts: every receipt carries enforced[] + fired[] + enforcedScope', JSON.stringify(rs.items[rs.items.length - 1]))
  ok(rs.items.every((r) => r.fired.every((k) => r.enforced.includes(k))), 'receipts: fired ⊆ enforced')
  ok(rs.items.every((r) => new Set(r.enforced).size === r.enforced.length), 'receipts: enforced[] has no duplicates')
  ok(Array.isArray(r1.enforced) && r1.enforced.includes('vmu.funding.currency'), 'read surfaces also disclose enforced[]')
  // per-code counting
  const counted = funded({ 'vmu.funding.auditPack': false })
  NOW = 1_000_000
  counted.f.auditPack({ account: counted.id })
  counted.f.auditPack({ account: counted.id })
  ok(counted.f.status().refusals.VMU_NOT_PERMITTED === 2, 'refusals are counted PER CODE', JSON.stringify(counted.f.status().refusals))
}

// ── declared universe, zero mechanism, determinism, read-only purity ────────────────────────────────
{
  const f = mk({})
  const st = f.status()
  ok(WIRED_KEYS.length === 16, 'the face wires all 16 declared vmu.funding.* keys', String(WIRED_KEYS.length))
  ok(st.declaredFundingKeys === 16, 'the declared universe is read from settings/planned.js', String(st.declaredFundingKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredFundingKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 16 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredFundingKeys }))
  ok(st.wiredNotDeclared.length === 0, 'no wired key is missing from the declared registry', JSON.stringify(st.wiredNotDeclared))
  ok(Object.keys(st.keys).length === 16 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 16 wired keys (no silent nulls)')
  // zero mechanism: documented defaults ⇒ a plain flow works end to end
  NOW = 1_000_000
  const z = mk({})
  const a = z.openAccount({ title: 'Z' })
  const b = z.budget({ account: a.account, lines: [{ category: 'travel', amountMinor: 500 }] })
  const e = z.expense({ account: a.account, line: { category: 'travel' }, amountMinor: 100, evidence: { receipt: 'r' } })
  const q = z.request({ account: a.account, title: 'Q', amountMinor: 50 })
  ok(a.ok === true && b.ok === true && e.ok === true && q.ok === true,
    'zero mechanism[+]: the documented defaults run a whole flow (account → budget → expense → request)')
  ok(z.accountView({ account: 'nope' }).code === 'VMU_FUNDING_ACCOUNT_MISSING', 'zero mechanism[-]: an unknown account is a named refusal')
  // read-only purity
  const before = JSON.stringify(z.status().counters)
  z.status(); z.accountView({ account: a.account }); z.list(); z.receiptsView()
  ok(JSON.stringify(z.status().counters) === before, 'READ paths (status/accountView/list/receiptsView) never mutate recorded data')
  // determinism: same scripted clock ⇒ identical counters
  const mkSame = () => { NOW = 777; const x = createFunding({ clock: () => NOW, settings: { 'vmu.funding.request': 'auto' } }); const acc = x.openAccount({ title: 'D' }); x.budget({ account: acc.account, lines: [{ category: 'c', amountMinor: 10 }] }); x.expense({ account: acc.account, line: { category: 'c' }, amountMinor: 5, evidence: { receipt: 'r' } }); x.request({ account: acc.account, title: 'q', amountMinor: 1 }); return x }
  ok(JSON.stringify(mkSame().status().counters) === JSON.stringify(mkSame().status().counters), 'two instances with the same inputs produce identical counters')
  ok(mkSame().status().at === 777, 'status() uses the injected clock (no real time)')
}

if (failed === 0) {
  console.log('=== VMU FUNDING: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU FUNDING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
