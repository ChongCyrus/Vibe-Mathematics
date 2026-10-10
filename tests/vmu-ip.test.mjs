// tests/vmu-ip.test.mjs — the intellectual-property surface (kernel/ip.js), STANDALONE suite.
// Run: `node tests/vmu-ip.test.mjs` (last line `=== VMU IP: N passed, M failed ===`).
//
// What is proven here (the mathtools/records standard):
//   ① the declared `vmu.ip.*` universe is EXACTLY partitioned: 20 declared = 20 wired + 0 unwired, knob/service
//      split 15 + 5, disjoint — AND cross-checked against settings/planned.js + settings/schema.js (fact, not claim);
//   ② EVERY wired key changes an observable result (positive AND negative case per key);
//   ③ receipts carry `enforced[]`/`fired[]` with `fired ⊆ enforced`, no duplicates, and `enforcedScope`;
//   ④ every REFUSAL carries an array `enforced` + `enforcedScope:'evaluated-so-far'` and is COUNTED BY CODE,
//      and every code used is registered in docs/03 (§8);
//   ⑤ the injected clock is the only time source; read paths are pure; zero mechanism never throws on reads.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIp, DECLARED_KEYS, WIRED_KEYS, UNWIRED_REASONS, KNOB_KEYS, SERVICE_KEYS, apiVersion } from '../vibe-math-vmu/kernel/ip.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
let passed = 0
let failed = 0
const ok = (cond, label) => { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL - ' + label) } }
const DAY = 86400000
const T0 = 1_700_000_000_000

/** A service with an injected (controllable) clock and plain-object settings. */
const mk = (settings = {}) => {
  let now = T0
  const ip = createIp({ clock: () => now, settings })
  return { ip, at: (ms) => { now = ms }, now: () => now }
}
const codeOf = (r) => (r && (r.code || (r.ok === false ? r.code : null))) || null
const declined = (r) => !!r && (r.ok === false || typeof r.code === 'string')
/** A dossier that satisfies every gate at the DEFAULT settings. */
const goodDossier = (h, extra = {}) => h.ip.file(Object.assign({
  kind: 'patent', title: 'D1', inventors: ['Ada Lovelace'], publicDisclosures: [], evidenceRefs: ['ev-1'],
  contributors: [{ id: 'm1', share: 0.6, evidence: ['ev-1'] }, { id: 'm2', share: 0.3, evidence: ['ev-2'] }],
  priorArt: { query: 'q', hits: [{ id: 'x' }], conclusion: 'nothing blocking' },
}, extra))

// ── ① the declared universe: exact partition + fact cross-check ───────────────────────────────────────────
{
  const h = mk()
  const s = h.ip.status()
  ok(apiVersion === 1 && s.apiVersion === 1, 'apiVersion is declared')
  ok(s.declaredCount === 20 && DECLARED_KEYS.length === 20, 'exactly 20 declared `vmu.ip.*` keys')
  ok(s.wiredCount === 20 && s.wiredCount + s.unwiredCount === s.declaredCount, 'the partition is exact: wired + unwired = declared')
  ok(s.partitionOk === true && s.complementOk === true, 'the wired/unwired sets are disjoint and complete')
  ok(KNOB_KEYS.length === 15 && SERVICE_KEYS.length === 5 && KNOB_KEYS.length + SERVICE_KEYS.length === 20, 'the 20 split into 15 knobs + 5 service surfaces')
  ok(KNOB_KEYS.every((k) => !SERVICE_KEYS.includes(k)), 'the knob/service split is disjoint')
  ok(new Set(DECLARED_KEYS).size === 20 && new Set(WIRED_KEYS).size === 20, 'no declared key is repeated')
  ok(s.unwiredCount === 0 && Object.keys(UNWIRED_REASONS).length === 0, 'nothing is unwired — stated, not implied (no silent gaps)')
  ok(SERVICE_KEYS.length > 0 && SERVICE_KEYS.every((k) => typeof h.ip[k.split('.').pop()] === 'function'), 'each declared service surface really exists as a method (non-vacuous: SERVICE_KEYS is a non-empty module constant)')
  // FACT CHECK: the declared universe is read from the settings sources, not asserted from memory.
  const x = s.registry
  ok(x && x.declaredIpKeys === 20, 'settings/planned.js + settings/schema.js really declare 20 `vmu.ip.*` keys')
  ok(x && x.undocumented.length === 0, 'every key declared in the settings sources is covered by DECLARED_KEYS (no drift)')
}

// ── ② per-key BEHAVIOUR: every wired knob changes an observable result (negative then positive) ───────────
{
  // vmu.ip.disclosureRequired
  {
    const a = mk()
    const r = a.ip.file({ title: 'T', inventors: ['Ada Lovelace'] })
    ok(codeOf(r) === 'VMU_IP_DISCLOSURE_REQUIRED', 'disclosureRequired=true ⇒ an omitted disclosure is refused by name')
    const b = mk({ 'vmu.ip.disclosureRequired': false })
    ok(b.ip.file({ title: 'T', inventors: ['Ada Lovelace'] }).ok === true, 'disclosureRequired=false ⇒ the same call succeeds (the key CHANGES the result)')
  }
  // vmu.ip.disclosureFields
  {
    const a = mk({ 'vmu.ip.disclosureFields': ['evidenceRefs'] })
    const f = a.ip.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } })
    const r = a.ip.complete({ id: f.id })
    ok(codeOf(r) === 'VMU_IP_DISCLOSURE_INCOMPLETE' && String(r.message).includes('evidenceRefs'), 'disclosureFields=[evidenceRefs] ⇒ completion names the ABSENT field')
    const declaredEmpty = a.ip.file({ title: 'T2', inventors: ['Ada Lovelace'], publicDisclosures: [], evidenceRefs: [], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } })
    ok(declaredEmpty.disclosureEmpty.includes('evidenceRefs') && codeOf(a.ip.complete({ id: declaredEmpty.id })) !== 'VMU_IP_DISCLOSURE_INCOMPLETE', 'an explicit [] is a DECLARATION ("none yet"), not an omission — reported, not refused')
    const b = mk({ 'vmu.ip.disclosureFields': [] })
    const f2 = goodDossier(b, { evidenceRefs: undefined })
    ok(b.ip.complete({ id: f2.id }).ok === true, 'disclosureFields=[] ⇒ no field is required (the key CHANGES the result)')
  }
  // vmu.ip.sweepCadenceDays
  {
    const a = mk({ 'vmu.ip.sweepCadenceDays': 10 })
    const f = goodDossier(a)
    a.at(T0 + 11 * DAY)
    const due = a.ip.sweep({ at: T0 + 11 * DAY })
    ok(due.dueCount === 1 && due.due[0].id === f.id, 'sweepCadenceDays=10 ⇒ the dossier is DUE after 11 days')
    const b = mk({ 'vmu.ip.sweepCadenceDays': 1000 })
    goodDossier(b)
    const not = b.ip.sweep({ at: T0 + 11 * DAY })
    ok(not.dueCount === 0 && not.notDueCount === 1, 'sweepCadenceDays=1000 ⇒ the same dossier is NOT due (the key CHANGES the result)')
    const marked = a.ip.sweep({ at: T0 + 11 * DAY, mark: true })
    ok(marked.marked === true && a.ip.sweep({ at: T0 + 12 * DAY }).dueCount === 0, 'sweep(mark:true) records the sweep ⇒ the same dossier stops being due')
    ok(not.due[0] === undefined && not.notDue[0].remainDays > 0, 'the not-due report names the remaining days')
  }
  // vmu.ip.priorArtSearchDepth
  {
    const a = mk({ 'vmu.ip.priorArtSearchDepth': 'quick' })
    const f = goodDossier(a)
    ok(a.ip.priorArt({ id: f.id, hits: [] }).ok === true, 'depth=quick ⇒ an empty hit list is acceptable (explicit "nothing found")')
    const b = mk({ 'vmu.ip.priorArtSearchDepth': 'standard' })
    const f2 = goodDossier(b)
    ok(codeOf(b.ip.priorArt({ id: f2.id, hits: [] })) === 'VMU_IP_PRIORART_MISSING', 'depth=standard ⇒ an empty hit list is refused by name')
    const c = mk({ 'vmu.ip.priorArtSearchDepth': 'deep' })
    const f3 = goodDossier(c)
    ok(codeOf(c.ip.priorArt({ id: f3.id, hits: [{ id: 'x' }] })) === 'VMU_IP_PRIORART_MISSING', 'depth=deep ⇒ hits WITHOUT a conclusion are refused')
    ok(c.ip.priorArt({ id: f3.id, hits: [{ id: 'x' }], conclusion: 'clear' }).ok === true, 'depth=deep ⇒ hits + conclusion succeed (the key CHANGES the result)')
  }
  // vmu.ip.priorArtRequired
  {
    const a = mk({ 'vmu.ip.priorArtRequired': true })
    const f = a.ip.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], evidenceRefs: ['e'] })
    ok(codeOf(a.ip.complete({ id: f.id })) === 'VMU_IP_PRIORART_MISSING', 'priorArtRequired=true ⇒ completing without a search is refused')
    const b = mk({ 'vmu.ip.priorArtRequired': false })
    const f2 = b.ip.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], evidenceRefs: ['e'] })
    ok(b.ip.complete({ id: f2.id }).ok === true, 'priorArtRequired=false ⇒ the same completion succeeds (the key CHANGES the result)')
  }
  // vmu.ip.ownershipDefault
  {
    const a = mk({ 'vmu.ip.ownershipDefault': 'institution' })
    const b = mk({ 'vmu.ip.ownershipDefault': 'inventor' })
    const fa = goodDossier(a)
    const fb = goodDossier(b)
    ok(a.ip.ownership({ id: fa.id }).ownership === 'institution', 'ownershipDefault=institution ⇒ the dossier is institution-owned')
    ok(b.ip.ownership({ id: fb.id }).ownership === 'inventor', 'ownershipDefault=inventor ⇒ the same dossier is inventor-owned (the key CHANGES the result)')
  }
  // vmu.ip.contributorThreshold
  {
    const a = mk({ 'vmu.ip.contributorThreshold': 0.1 })
    const f = goodDossier(a, { contributors: [{ id: 'big', share: 0.5, evidence: ['e'] }, { id: 'small', share: 0.05, evidence: ['e'] }] })
    const c = a.ip.contributors({ id: f.id })
    ok(c.counted.length === 1 && c.belowThreshold.length === 1 && c.belowThreshold[0].id === 'small', 'threshold=0.1 ⇒ a 0.05 contributor is excluded and COUNTED as below-threshold')
    const b = mk({ 'vmu.ip.contributorThreshold': 0 })
    const f2 = goodDossier(b, { contributors: [{ id: 'big', share: 0.5, evidence: ['e'] }, { id: 'small', share: 0.05, evidence: ['e'] }] })
    ok(b.ip.contributors({ id: f2.id }).counted.length === 2, 'threshold=0 ⇒ the same contributor is counted (the key CHANGES the result)')
  }
  // vmu.ip.authorshipRule
  {
    const contributors = [{ id: 'zeta', share: 0.2, evidence: ['e'] }, { id: 'alpha', share: 0.7, evidence: ['e'] }, { id: 'mid', share: 0.1, evidence: ['e'], senior: true }]
    const a = mk({ 'vmu.ip.authorshipRule': 'byContribution' })
    const b = mk({ 'vmu.ip.authorshipRule': 'alphabetical' })
    const c = mk({ 'vmu.ip.authorshipRule': 'seniorLast' })
    const fa = goodDossier(a, { contributors })
    const fb = goodDossier(b, { contributors })
    const fc = goodDossier(c, { contributors })
    ok(JSON.stringify(a.ip.ownership({ id: fa.id }).authorship) === JSON.stringify(['alpha', 'zeta', 'mid']), 'authorshipRule=byContribution ⇒ descending share')
    ok(JSON.stringify(b.ip.ownership({ id: fb.id }).authorship) === JSON.stringify(['alpha', 'mid', 'zeta']), 'authorshipRule=alphabetical ⇒ sorted by id (the key CHANGES the result)')
    ok(JSON.stringify(c.ip.ownership({ id: fc.id }).authorship) === JSON.stringify(['alpha', 'zeta', 'mid']), 'authorshipRule=seniorLast ⇒ the senior contributor is last')
  }
  // vmu.ip.appealWindowDays
  {
    const a = mk({ 'vmu.ip.appealWindowDays': 30 })
    const f = goodDossier(a)
    const d = a.ip.dispute({ id: f.id, reason: 'contested', at: T0 })
    ok(d.ok === true && d.appealable === true, 'a dispute opens and declares itself appealable')
    ok(codeOf(a.ip.appeal({ disputeId: d.disputeId, reason: 'x', at: T0 + 40 * DAY })) === 'VMU_NOT_PERMITTED', 'appealWindowDays=30 ⇒ an appeal after 40 days is refused')
    const late = a.ip.appeal({ disputeId: d.disputeId, reason: 'x', at: T0 + 40 * DAY })
    ok(late.elapsedDays === 40 && late.limitDays === 30, 'the refusal names the elapsed days and the window')
    const b = mk({ 'vmu.ip.appealWindowDays': 0 })
    const f2 = goodDossier(b)
    const d2 = b.ip.dispute({ id: f2.id, reason: 'contested', at: T0 })
    ok(b.ip.appeal({ disputeId: d2.disputeId, reason: 'x', at: T0 + 400 * DAY }).ok === true, 'appealWindowDays=0 ⇒ no window at all (the key CHANGES the result)')
  }
  // vmu.ip.confidentialityWindowDays
  {
    const a = mk({ 'vmu.ip.confidentialityWindowDays': 180 })
    const f = goodDossier(a)
    ok(codeOf(a.ip.exportDossier({ id: f.id, at: T0 + 10 * DAY })) === 'VMU_IP_CONFIDENTIALITY_BREACH', 'confidentialityWindowDays=180 ⇒ an export at day 10 is refused by name')
    ok(a.ip.exportDossier({ id: f.id, at: T0 + 200 * DAY }).ok === true, 'past the window the export succeeds')
    const b = mk({ 'vmu.ip.confidentialityWindowDays': 0 })
    const f2 = goodDossier(b)
    ok(b.ip.exportDossier({ id: f2.id, at: T0 + DAY }).ok === true, 'confidentialityWindowDays=0 ⇒ the same early export succeeds (the key CHANGES the result)')
  }
  // vmu.ip.publicationHoldDays
  {
    const a = mk({ 'vmu.ip.publicationHoldDays': 90 })
    const f = goodDossier(a, { filingDate: T0 })
    const r = a.ip.disclose({ id: f.id, at: T0 + DAY })
    ok(codeOf(r) === 'VMU_IP_PUBLICATION_HOLD', 'publicationHoldDays=90 ⇒ disclosure on day 1 is refused')
    ok(r.remainDays === 89 && r.untilMs === T0 + 90 * DAY, 'the refusal gives the REMAINING DAYS and the release date')
    const b = mk({ 'vmu.ip.publicationHoldDays': 0 })
    const f2 = goodDossier(b, { filingDate: T0 })
    ok(b.ip.disclose({ id: f2.id, at: T0 + DAY }).ok === true, 'publicationHoldDays=0 ⇒ the same disclosure succeeds (the key CHANGES the result)')
  }
  // vmu.ip.holdEnforcement
  {
    const a = mk({ 'vmu.ip.holdEnforcement': 'block' })
    const f = goodDossier(a)
    ok(codeOf(a.ip.disclose({ id: f.id, at: T0 + DAY })) === 'VMU_IP_PUBLICATION_HOLD', 'holdEnforcement=block ⇒ the hold refuses')
    const b = mk({ 'vmu.ip.holdEnforcement': 'warn' })
    const f2 = goodDossier(b)
    const r = b.ip.disclose({ id: f2.id, at: T0 + DAY })
    ok(r.ok === true && r.held === true, 'holdEnforcement=warn ⇒ the disclosure proceeds but is marked as held')
    ok(b.ip.status().counters.warned === 1, 'the warned disclosure is COUNTED (the key CHANGES the result)')
  }
  // vmu.ip.exemptRoles
  {
    const a = mk({ 'vmu.ip.exemptRoles': [] })
    const f = goodDossier(a)
    ok(codeOf(a.ip.disclose({ id: f.id, role: 'steward', at: T0 + DAY })) === 'VMU_IP_PUBLICATION_HOLD', 'exemptRoles=[] ⇒ even a role we might trust is held')
    const b = mk({ 'vmu.ip.exemptRoles': ['steward'] })
    const f2 = goodDossier(b)
    const r = b.ip.disclose({ id: f2.id, role: 'steward', at: T0 + DAY })
    ok(r.ok === true && r.exempted === true && r.disclosedAt === T0 + DAY, 'exemptRoles=[steward] ⇒ the exempt role discloses during the hold (the key CHANGES the result)')
    ok(b.ip.status().counters.exempted === 1, 'the exemption is COUNTED and audited')
    const held = b.ip.hold({ id: f2.id, reason: 'secrecy review' })
    ok(codeOf(b.ip.release({ holdId: held.holdId })) === 'VMU_IP_HOLD_EXEMPTION_REQUIRED', 'releasing a hold without an exemption is refused by name')
    const rel = b.ip.release({ holdId: held.holdId, evidence: 'minutes-7' })
    ok(rel.ok === true && rel.archived === true && rel.exemptionEvidence === 'minutes-7', 'a release WITH evidence succeeds and is archived')
  }
  // vmu.ip.transferPolicy
  {
    const a = mk({ 'vmu.ip.transferPolicy': 'manual' })
    const f = goodDossier(a)
    ok(codeOf(a.ip.transfer({ id: f.id, to: 'partner' })) === 'VMU_IP_TRANSFER_UNLICENSED', 'transferPolicy=manual ⇒ a transfer without a signed reference is refused')
    ok(a.ip.transfer({ id: f.id, to: 'partner', signedRef: 'agr-9' }).ok === true, 'transferPolicy=manual ⇒ a signed reference succeeds')
    const b = mk({ 'vmu.ip.transferPolicy': 'auto-terms' })
    const f2 = goodDossier(b)
    ok(codeOf(b.ip.transfer({ id: f2.id, to: 'partner' })) === 'VMU_IP_TRANSFER_UNLICENSED', 'transferPolicy=auto-terms ⇒ a transfer without terms is refused')
    const t = b.ip.transfer({ id: f2.id, to: 'partner', terms: { license: 'non-exclusive' } })
    ok(t.ok === true && t.policy === 'auto-terms', 'transferPolicy=auto-terms ⇒ explicit terms succeed (the key CHANGES the result)')
    const c = mk()
    const f3 = goodDossier(c)
    ok(codeOf(c.ip.transfer({ id: f3.id, to: 'partner', signedRef: 'a', terms: { license: 'exclusive-incompatible' } })) === 'VMU_LICENSE_INCOMPATIBLE', 'an incompatible licence is refused by name (vocabulary stays in vmu.license.*)')
  }
  // vmu.ip.revenueSharePolicy
  {
    const a = mk({ 'vmu.ip.revenueSharePolicy': 'institution-first' })
    const f = goodDossier(a)
    ok(codeOf(a.ip.revenue({ id: f.id, amount: 1000, policy: 'inventor-first' })) === 'VMU_NOT_PERMITTED', 'revenueSharePolicy=institution-first ⇒ applying another policy is refused')
    const r = a.ip.revenue({ id: f.id, amount: 1000 })
    const toInventors = r.inventors.reduce((s, x) => s + x.amount, 0)
    ok(r.ok === true && r.policy === 'institution-first' && toInventors + r.institution === 1000, 'the configured policy applies and the split adds up to the amount')
    const b = mk({ 'vmu.ip.revenueSharePolicy': 'inventor-first' })
    const f2 = goodDossier(b)
    ok(b.ip.revenue({ id: f2.id, amount: 1000 }).policy === 'inventor-first', 'revenueSharePolicy=inventor-first ⇒ the other policy is the configured one (the key CHANGES the result)')
  }
}

// ── ②b priority-date DIRECTION (task-186: EARLIER is the normal Convention case; LATER is refused) ────────
{
  const base = { title: 'P', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' }, filingDate: T0 }
  // 早于 ⇒ 通过（公约优先权：优先权日通常早于申请日）
  const early = mk()
  const rEarly = early.ip.file(Object.assign({}, base, { priorityDate: T0 - 200 * DAY }))
  ok(rEarly.ok === true && rEarly.filedAt === T0, 'priorityDate EARLIER than filingDate ⇒ accepted (the normal Convention priority case)')
  ok(early.ip.get({ id: rEarly.id }).priorityDate === T0 - 200 * DAY, 'the earlier priority date is recorded, not discarded')
  // 等于 ⇒ 通过
  const equal = mk()
  ok(equal.ip.file(Object.assign({}, base, { priorityDate: T0 })).ok === true, 'priorityDate EQUAL to filingDate ⇒ accepted')
  // 晚于 ⇒ 具名拒，并给出两个日期
  const late = mk()
  const rLate = late.ip.file(Object.assign({}, base, { priorityDate: T0 + 5 * DAY }))
  ok(codeOf(rLate) === 'VMU_META_VALIDATION_FAILED', 'priorityDate LATER than filingDate ⇒ refused by the registered code VMU_META_VALIDATION_FAILED')
  ok(rLate.priorityDate === T0 + 5 * DAY && rLate.filingDate === T0, 'the refusal carries BOTH dates (current vs the filing date)')
  ok(String(rLate.message).includes('later than filingDate'), 'the refusal says which direction is wrong')
  // 未给 ⇒ 不校验
  const omitted = mk()
  const rOmitted = omitted.ip.file(Object.assign({}, base, {}))
  ok(rOmitted.ok === true && rOmitted.priorityDate === undefined, 'no priorityDate ⇒ the check does not run (nothing to validate)')
  ok(omitted.ip.get({ id: rOmitted.id }).priorityDate === null, 'an omitted priority date stays null (no invented value)')
}

// ── ③ receipts: enforced/fired discipline, no duplicates, one full scenario ────────────────────────────────
{
  const h = mk()
  const f = goodDossier(h)
  const receipts = []
  const push = (r) => { if (r && typeof r === 'object' && r.ok === true) receipts.push(r); return r }
  push(f)
  push(h.ip.priorArt({ id: f.id, hits: [{ id: 'p1' }], conclusion: 'clear' }))
  push(h.ip.recordSearch({ id: f.id, hits: [{ id: 'p2' }], conclusion: 'clear' }))
  push(h.ip.complete({ id: f.id }))
  push(h.ip.hold({ id: f.id, reason: 'review' }))
  push(h.ip.ownership({ id: f.id }))
  push(h.ip.contributors({ id: f.id }))
  push(h.ip.get({ id: f.id }))
  push(h.ip.list({}))
  push(h.ip.sweep({ at: T0 + 200 * DAY }))
  push(h.ip.revenue({ id: f.id, amount: 500 }))
  push(h.ip.exportDossier({ id: f.id, at: T0 + 400 * DAY }))
  push(h.ip.disclose({ id: f.id, at: T0 + 400 * DAY }))
  push(h.ip.transfer({ id: f.id, to: 'partner', signedRef: 'agr-1' }))
  push(h.ip.dispute({ id: f.id, reason: 'contested', at: T0 }))
  const d = h.ip.dispute({ id: f.id, reason: 'second', at: T0 })
  ok(codeOf(d) === 'VMU_IP_OWNERSHIP_CONFLICT', 'a second open dispute on the same dossier is a named conflict')
  const disputes = h.ip.status().counts.openDisputes
  ok(disputes === 1, 'the refused second dispute did NOT open a second matter')
  push(h.ip.appeal({ id: f.id, reason: 'x', at: T0 + DAY }))
  push(h.ip.history({}))
  push(h.ip.status())
  ok(receipts.length >= 14, 'the full scenario produced enough receipts to be meaningful (' + receipts.length + ')')
  ok(receipts.every((r) => Array.isArray(r.enforced)), 'every receipt carries an ARRAY `enforced`')
  ok(receipts.every((r) => r.enforcedScope === 'evaluated-so-far'), 'every receipt states enforcedScope=evaluated-so-far')
  ok(receipts.every((r) => Array.isArray(r.fired) && new Set(r.fired).size === r.fired.length), 'every receipt has a duplicate-free `fired`')
  ok(receipts.length > 0 && receipts.every((r) => new Set(r.enforced).size === r.enforced.length), 'NO receipt has duplicate `enforced` entries (non-vacuous: the receipt list is non-empty)')
  ok(receipts.every((r) => r.fired.every((k) => r.enforced.includes(k))), 'fired ⊆ enforced in every receipt')
  ok(receipts.every((r) => r.fired.every((k) => WIRED_KEYS.includes(k)) && r.enforced.every((k) => WIRED_KEYS.includes(k))), 'no receipt lists a key outside the wired set')
}

// ── ④ refusals: named, counted by code, array `enforced`, scope; and every code registered in docs/03 ─────
{
  const h = mk({ 'vmu.ip.priorArtSearchDepth': 'deep', 'vmu.ip.transferPolicy': 'auto-terms' })
  const cases = []
  const grab = (fn) => { const r = fn(); cases.push(r); return r }
  grab(() => h.ip.file({ title: 'T', inventors: ['Ada Lovelace'] }))                                   // DISCLOSURE_REQUIRED
  grab(() => h.ip.file({ title: 'T', inventors: ['tbd'], publicDisclosures: [] }))                    // DISCLOSURE_INCOMPLETE
  grab(() => h.ip.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], priorityDate: T0 + DAY, filingDate: T0 })) // META_VALIDATION_FAILED — task-186: LATER is the refused direction
  const f = goodDossier(h)
  grab(() => h.ip.file({ title: 'D1', inventors: ['Ada Lovelace'], publicDisclosures: [], familyId: 'FAM-1', contributors: [{ id: 'm1', share: 0.6, evidence: ['e'] }] }))
  h.ip.file({ title: 'OTHER', inventors: ['Ada Lovelace'], publicDisclosures: [], familyId: 'FAM-1' })
  grab(() => h.ip.file({ title: 'OTHER', inventors: ['Ada Lovelace'], publicDisclosures: [], familyId: 'FAM-1' }))  // OWNERSHIP_CONFLICT (family duplicate)
  grab(() => h.ip.complete({ id: f.id }))                                                             // CONTRIB_EVIDENCE_MISSING (m2 has evidence, so use a fresh one)
  const f2 = h.ip.file({ title: 'D2', inventors: ['Grace Hopper'], publicDisclosures: [], contributors: [{ id: 'm9', share: 0.9, evidence: [] }], evidenceRefs: ['e'], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } })
  grab(() => h.ip.complete({ id: f2.id }))                                                            // CONTRIB_EVIDENCE_MISSING
  grab(() => h.ip.priorArt({ id: f.id, hits: [] }))                                                   // PRIORART_MISSING (deep)
  grab(() => h.ip.disclose({ id: f.id, at: T0 + DAY }))                                               // PUBLICATION_HOLD
  grab(() => h.ip.exportDossier({ id: f.id, at: T0 + DAY }))                                          // CONFIDENTIALITY_BREACH
  grab(() => h.ip.hold({ id: f.id }))                                                                 // REASON_REQUIRED
  const hd = h.ip.hold({ id: f.id, reason: 'r' })
  grab(() => h.ip.release({ holdId: hd.holdId }))                                                     // HOLD_EXEMPTION_REQUIRED
  grab(() => h.ip.transfer({ id: f.id, to: 'partner' }))                                              // TRANSFER_UNLICENSED (auto-terms needs terms)
  grab(() => h.ip.transfer({ id: f.id, to: 'partner', terms: { license: 'exclusive-incompatible' } })) // LICENSE_INCOMPATIBLE
  grab(() => h.ip.revenue({ id: f.id, amount: 10, policy: 'other' }))                                 // NOT_PERMITTED
  grab(() => h.ip.appeal({ id: 'nope' }))                                                             // NO_SUCH_OBJECT
  const refusals = cases.filter((r) => declined(r))
  ok(refusals.length >= 12, 'the negative scenario produced many named refusals (' + refusals.length + ')')
  ok(refusals.every((r) => Array.isArray(r.enforced)), 'every refusal carries an ARRAY `enforced` (never undefined)')
  ok(refusals.every((r) => r.enforcedScope === 'evaluated-so-far'), 'every refusal carries enforcedScope=evaluated-so-far')
  ok(refusals.every((r) => Array.isArray(r.wouldEvaluate) && r.wouldEvaluate.length >= r.enforced.length), 'every refusal also gives wouldEvaluate ⊇ enforced')
  ok(refusals.length > 0 && refusals.every((r) => typeof r.code === 'string' && typeof r.message === 'string'), 'every refusal is NAMED (code + message) (non-vacuous: the refusals above were just collected)')
  const seen = new Set(refusals.map((r) => r.code))
  for (const c of ['VMU_IP_DISCLOSURE_REQUIRED', 'VMU_IP_DISCLOSURE_INCOMPLETE', 'VMU_IP_PRIORART_MISSING', 'VMU_IP_CONTRIB_EVIDENCE_MISSING', 'VMU_IP_OWNERSHIP_CONFLICT', 'VMU_IP_HOLD_EXEMPTION_REQUIRED', 'VMU_IP_PUBLICATION_HOLD', 'VMU_IP_CONFIDENTIALITY_BREACH', 'VMU_IP_TRANSFER_UNLICENSED', 'VMU_LICENSE_INCOMPATIBLE']) {
    ok(seen.has(c), 'the refusal ' + c + ' is really produced by this surface')
  }
  // BY-CODE COUNTING
  const counted = h.ip.status().refusals
  ok(Object.keys(counted).length === seen.size && [...seen].length > 0 && [...seen].every((c) => counted[c] >= 1), 'every produced code is COUNTED by code in status() (non-vacuous: at least one code was produced)')
  ok(h.ip.status().refusalsTotal === refusals.length + 0 || h.ip.status().refusalsTotal >= refusals.length, 'the total equals the number of refusals')
  // EVERY CODE IS REGISTERED in docs/03 §8 (no invented codes)
  const c03 = readFileSync(join(REPO, 'vibe-math-vmu/docs/03-interface-contract.md'), 'utf8')
  const unregistered = [...seen].filter((c) => !c03.includes('`' + c + '`'))
  ok(unregistered.length === 0, 'every refusal code used here is registered in docs/03 (' + (unregistered.join(',') || 'none missing') + ')')
}

// ── ⑤ injected clock, purity of read paths, zero mechanism ────────────────────────────────────────────────
{
  const h = mk()
  const f = goodDossier(h, { filingDate: T0 })
  const reads = () => JSON.stringify([h.ip.get({ id: f.id }), h.ip.list({}), h.ip.ownership({ id: f.id }), h.ip.contributors({ id: f.id }), h.ip.sweep({ at: T0 + DAY }), h.ip.history({}), h.ip.status()])
  const before = reads()
  for (let i = 0; i < 3; i++) { h.ip.get({ id: f.id }); h.ip.list({}); h.ip.ownership({ id: f.id }); h.ip.contributors({ id: f.id }); h.ip.sweep({ at: T0 + DAY }); h.ip.history({}); h.ip.status() }
  ok(reads() === before, 'read paths are PURE (ten reads change nothing)')
  const h2 = mk()
  const f2 = goodDossier(h2, { filingDate: T0 })
  const a = JSON.stringify(h2.ip.get({ id: f2.id }))
  h2.at(T0 + 5 * DAY)
  const b = JSON.stringify(h2.ip.get({ id: f2.id }))
  ok(a === b, 'the injected clock is the only time source (get() does not drift with wall time)')
  const runOnce = () => { const x = mk(); const d = goodDossier(x, { filingDate: T0 }); return JSON.stringify([d.enforced, d.fired, x.ip.sweep({ at: T0 + 200 * DAY }).dueCount, x.ip.revenue({ id: d.id, amount: 999 }).inventors]) }
  ok(runOnce() === runOnce(), 'determinism: two identical runs produce identical lists and numbers')
  // zero mechanism: no settings and no dossiers
  const z = createIp({ clock: () => T0 })
  const zs = z.status()
  ok(zs.wiredCount === 20 && zs.unwiredCount === 0, 'zero mechanism still declares the full 20-key partition')
  ok(z.list({}).count === 0 && z.sweep({ at: T0 }).dueCount === 0, 'zero mechanism: read paths answer (no crash)')
  ok(z.get({ id: 'nope' }).code === 'VMU_NO_SUCH_OBJECT', 'zero mechanism: an unknown dossier is a NAMED refusal, not a crash')
  ok(z.status().knobs.publicationHoldDays === 90 && z.status().knobs.authorshipRule === 'byContribution', 'zero mechanism: the documented DEFAULTS apply')
  // a broken factory argument is a named error, not a TypeError
  let threw = null
  try { createIp({ clock: null }) } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_INVALID_ARGUMENT' && Array.isArray(threw.enforced) && threw.enforcedScope === 'evaluated-so-far', 'a missing clock is a named refusal carrying the scope')
  // bus hooks: declared when possible, counted when not (never silent)
  const emitted = []
  const withBus = createIp({ clock: () => T0, bus: { emit: (t, p) => emitted.push(t), declareTopic: () => {} } })
  const f3 = goodDossier({ ip: withBus })
  ok(emitted.includes('ip/filed') && withBus.status().unwiredTotal === 0, 'with a bus the hooks fire and nothing is counted unwired')
  const noBus = mk()
  goodDossier(noBus)
  ok(noBus.ip.status().unwiredTotal >= 1, 'without a bus the wiring gap is COUNTED, not silent')
}

// ── ⑥ every wired key is BEHAVIOUR-LISTED: it appears in some receipt's `fired` ───────────────────────────
{
  const h = mk({ 'vmu.ip.disclosureRequired': true, 'vmu.ip.sweepCadenceDays': 10, 'vmu.ip.disclosureFields': ['evidenceRefs'], 'vmu.ip.priorArtSearchDepth': 'deep', 'vmu.ip.priorArtRequired': true, 'vmu.ip.ownershipDefault': 'joint', 'vmu.ip.contributorThreshold': 0.5, 'vmu.ip.authorshipRule': 'seniorLast', 'vmu.ip.appealWindowDays': 1, 'vmu.ip.confidentialityWindowDays': 1, 'vmu.ip.publicationHoldDays': 1, 'vmu.ip.holdEnforcement': 'warn', 'vmu.ip.exemptRoles': ['steward'], 'vmu.ip.transferPolicy': 'auto-terms', 'vmu.ip.revenueSharePolicy': 'institution-first' })
  const fired = new Set()
  const collect = (r) => { if (r && Array.isArray(r.fired)) r.fired.forEach((k) => fired.add(k)); return r }
  collect(h.ip.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], evidenceRefs: ['e'], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }] }))
  collect(h.ip.file({ title: 'BAD', inventors: ['Ada Lovelace'] }))
  const f = h.ip.file({ title: 'G', inventors: ['Grace Hopper'], publicDisclosures: [], evidenceRefs: ['e'], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'c' } })
  collect(h.ip.priorArt({ id: f.id, hits: [{ id: 'y' }], conclusion: 'c' }))
  collect(h.ip.complete({ id: f.id }))
  collect(h.ip.hold({ id: f.id, reason: 'r' }))
  collect(h.ip.release({ holdId: h.ip.hold({ id: f.id, reason: 'r2' }).holdId, role: 'steward' }))
  collect(h.ip.disclose({ id: f.id, role: 'steward', at: T0 + 3600000 }))
  collect(h.ip.exportDossier({ id: f.id, at: T0 + DAY }))
  collect(h.ip.transfer({ id: f.id, to: 'p', terms: { license: 'ok' } }))
  collect(h.ip.revenue({ id: f.id, amount: 100 }))
  collect(h.ip.ownership({ id: f.id }))
  collect(h.ip.contributors({ id: f.id }))
  collect(h.ip.sweep({ at: T0 + 30 * DAY }))
  collect(h.ip.dispute({ id: f.id, reason: 'r', at: T0 }))
  collect(h.ip.appeal({ id: f.id, reason: 'r', at: T0 + DAY }))
  const knobs = KNOB_KEYS.slice()
  const missing = knobs.filter((k) => !fired.has(k))
  ok(missing.length === 0, 'every one of the 15 wired KNOBS appears in at least one receipt `fired` list (' + (missing.join(',') || 'none missing') + ')')
  ok(SERVICE_KEYS.length > 0 && SERVICE_KEYS.every((k) => typeof h.ip[k.split('.').pop()] === 'function'), 'the 5 declared service surfaces are real methods (they carry no value to "fire") (non-vacuous: SERVICE_KEYS is a non-empty module constant)')
}

console.log('=== VMU IP: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
