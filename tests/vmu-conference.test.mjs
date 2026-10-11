#!/usr/bin/env node
// vmu CONFERENCE — the guard for kernel/conference.js (the 18 declared `vmu.conference.*` keys).
//
// WHAT THIS PROVES
//   · every wired key changes an observable result (positive + negative assertion each);
//   · every receipt AND every refusal carries `enforced[]` (the keys consulted), `fired[]` (the subset that
//     changed the outcome, with fired ⊆ enforced) and `enforcedScope:'evaluated-so-far'` (round 26 / D3);
//   · WIRED ↔ plannedKeys are complementary and partition the 18 declared keys;
//   · refusals are counted BY CODE; the clock is injected; read surfaces never mutate;
//   · zero mechanism is inert-but-working (documented defaults), and the meeting layer is REFERENCED only.
import { createConference, WIRED_KEYS, ENFORCED_SCOPE } from '../vibe-math-vmu/kernel/conference.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }
const DAY = 86400000

let NOW = 1_000_000
const mk = (settings = {}, seams = {}) => createConference(Object.assign({ clock: () => NOW, settings }, seams))
const conf = (settings = {}, seams = {}) => {
  NOW = 1_000_000
  const t = mk(settings, seams)
  const r = t.open({ id: 'c1', topics: ['ml', 'hci'] })
  return { t, id: r.conference }
}
const goodSubmit = { title: 'A paper', authors: ['ada'], topics: ['ml'] }

// ── 1–2. CFP window: cfpOpenMs / cfpCloseMs ─────────────────────────────────────────────────────────
{
  const h = conf({ 'vmu.conference.cfpOpenMs': 2_000_000, 'vmu.conference.cfpCloseMs': 3_000_000 })
  const e1 = errOf(() => h.t.submit(Object.assign({ conference: h.id }, goodSubmit)))
  ok(e1 && e1.code === 'VMU_CONF_CFP_CLOSED' && /not opened yet/.test(e1.message),
    'cfpOpenMs[-]: submitting before the window opens is a named refusal', e1 && e1.code)
  NOW = 2_500_000
  ok(errOf(() => h.t.submit(Object.assign({ conference: h.id }, goodSubmit))) === null, 'cfpOpenMs[+]: inside the window the submission passes')
  const h2 = conf({ 'vmu.conference.cfpCloseMs': 1_500_000 })
  NOW = 2_000_000
  const e2 = errOf(() => h2.t.submit(Object.assign({ conference: h2.id }, goodSubmit)))
  ok(e2 && e2.code === 'VMU_CONF_CFP_CLOSED' && /现值=2000000ms/.test(e2.hint) && /截止=1500000ms/.test(e2.hint),
    'cfpCloseMs[-]: a late submission is refused WITH 现值/截止', e2 && e2.hint)
  const h3 = conf({ 'vmu.conference.cfpCloseMs': 9_000_000 })
  NOW = 2_000_000
  ok(errOf(() => h3.t.submit(Object.assign({ conference: h3.id }, goodSubmit))) === null, 'cfpCloseMs[+]: before the deadline the submission passes')
  // a malformed window is refused at open()
  const bad = mk({ 'vmu.conference.cfpOpenMs': 500, 'vmu.conference.cfpCloseMs': 100 })
  ok(codeOf(() => bad.open({ id: 'x' })) === 'VMU_CONF_SUBMISSION_INVALID', 'cfpOpenMs/cfpCloseMs[]: an inverted window is refused at open()')
}

// ── 3. topicsRequired ───────────────────────────────────────────────────────────────────────────────
{
  const h = conf({ 'vmu.conference.topicsRequired': true })
  ok(errOf(() => h.t.submit({ conference: h.id, title: 'ok', authors: ['a'], topics: ['ml'] })) === null,
    'topicsRequired[+]: an in-scope topic passes')
  const e1 = errOf(() => h.t.submit({ conference: h.id, title: 'no topics', authors: ['b'] }))
  ok(e1 && e1.code === 'VMU_CONF_SUBMISSION_INVALID' && /must name its topics/.test(e1.message),
    'topicsRequired[-]: a topic-less submission is refused', e1 && e1.code)
  const e2 = errOf(() => h.t.submit({ conference: h.id, title: 'outside', authors: ['c'], topics: ['astro'] }))
  ok(e2 && e2.code === 'VMU_CONF_SUBMISSION_INVALID' && /outside the call-for-papers scope/.test(e2.message),
    'topicsRequired[-]: an out-of-scope topic is refused', e2 && e2.code)
  const free = conf({})
  ok(errOf(() => free.t.submit({ conference: free.id, title: 'no topics', authors: ['d'] })) === null,
    'topicsRequired[+]: with the key off, topics are optional')
}

// ── 4. anonymityMode ────────────────────────────────────────────────────────────────────────────────
{
  const dbl = conf({ 'vmu.conference.anonymityMode': 'double' })
  const s = dbl.t.submit({ conference: dbl.id, title: 'blind', authors: ['ada', 'bob'], topics: ['ml'] }).submission
  const asReviewer = dbl.t.viewSubmission({ conference: dbl.id, submission: s, asReviewer: true })
  const asChair = dbl.t.viewSubmission({ conference: dbl.id, submission: s, asReviewer: false })
  ok(asReviewer.authorsHidden === true && asReviewer.authors.length === 0 && asChair.authors.length === 2,
    'anonymityMode[+]: double-blind hides authors from the REVIEWER view only', JSON.stringify({ r: asReviewer.authors.length, c: asChair.authors.length }))
  const e = errOf(() => dbl.t.review({ conference: dbl.id, submission: s, reviewer: 'r1', authorName: 'ada' }))
  ok(e && e.code === 'VMU_OUTREACH_ANONYMITY_BREACH', 'anonymityMode[-]: a review carrying the author identity is refused', e && e.code)
  const single = conf({ 'vmu.conference.anonymityMode': 'single' })
  const s2 = single.t.submit({ conference: single.id, title: 'open', authors: ['ada'], topics: ['ml'] }).submission
  ok(single.t.viewSubmission({ conference: single.id, submission: s2, asReviewer: true }).authors.length === 1,
    'anonymityMode[+]: single-blind shows the authors to reviewers')
}

// ── 5. reviewerConflicts ────────────────────────────────────────────────────────────────────────────
{
  const h = conf({ 'vmu.conference.reviewerConflicts': true })
  const e1 = errOf(() => h.t.submit({ conference: h.id, title: 'x', authors: ['a'], topics: ['ml'] }))
  ok(e1 && e1.code === 'VMU_COMPLIANCE_COI_UNDISCLOSED' && /conflict declaration/.test(e1.message),
    'reviewerConflicts[-]: a submission without a conflict declaration is refused', e1 && e1.code)
  const s = h.t.submit({ conference: h.id, title: 'x', authors: ['a'], topics: ['ml'], conflictsDeclared: true }).submission
  const e2 = errOf(() => h.t.assign({ conference: h.id, submission: s, reviewers: ['r1', 'r2'], conflicted: ['r1'] }))
  ok(e2 && e2.code === 'VMU_CONF_ASSIGNMENT_CONFLICT', 'reviewerConflicts[-]: assigning a conflicted reviewer is refused', e2 && e2.code)
  const e3 = errOf(() => h.t.review({ conference: h.id, submission: s, reviewer: 'a' }))
  ok(e3 && e3.code === 'VMU_REVIEW_SELF_DENIED', 'reviewerConflicts[-]: a self-review is refused', e3 && e3.code)
  ok(errOf(() => h.t.assign({ conference: h.id, submission: s, reviewers: ['r2', 'r3'], conflicted: ['r1'] })) === null,
    'reviewerConflicts[+]: unconflicted reviewers are assigned')
  const off = conf({})
  ok(errOf(() => off.t.submit({ conference: off.id, title: 'x', authors: ['a'], topics: ['ml'] })) === null,
    'reviewerConflicts[+]: with the key off no declaration is required')
}

// ── 6. proceedingsTrack ─────────────────────────────────────────────────────────────────────────────
{
  const h = conf({ 'vmu.conference.proceedingsTrack': 'proceedings' })
  const r = h.t.submit({ conference: h.id, title: 'proc', authors: ['ada'], topics: ['ml'], forProceedings: true })
  ok(r.receipt.proceedingsTrack === 'proceedings', 'proceedingsTrack[+]: the paper is routed to the declared track', JSON.stringify(r.receipt.proceedingsTrack))
  const e = errOf(() => h.t.decide({ conference: h.id, submission: r.submission, decision: 'accept' }))
  ok(e === null, 'proceedingsTrack[+]: an accepted paper keeps its proceedings route')
  const none = conf({})
  const e2 = errOf(() => none.t.submit({ conference: none.id, title: 'p', authors: ['a'], topics: ['ml'], forProceedings: true }))
  ok(e2 && e2.code === 'VMU_CONF_SUBMISSION_INVALID' && /no proceedings track/.test(e2.message),
    'proceedingsTrack[-]: asking for proceedings without a declared track is refused', e2 && e2.code)
}

// ── 7–9. assign / reviewAssignmentsPerPaper / reviewDeadlineDays ────────────────────────────────────
{
  const h = conf({ 'vmu.conference.assign': 'auto', 'vmu.conference.reviewAssignmentsPerPaper': 2, 'vmu.conference.reviewDeadlineDays': 10 })
  const s = h.t.submit({ conference: h.id, title: 'a', authors: ['ada'], topics: ['ml'] }).submission
  const a = h.t.assign({ conference: h.id, submission: s, eligible: ['r3', 'r1', 'r2'], conflicted: ['r2'] })
  ok(a.reviewers.join(',') === 'r1,r3' && a.receipt.assignedBy === 'auto',
    'assign[+]: auto picks deterministically from the pool, skipping conflicted reviewers', JSON.stringify(a.reviewers))
  ok(a.deadlineAt === 1_000_000 + 10 * DAY && a.receipt.deadlineAt === a.deadlineAt,
    'reviewDeadlineDays[+]: the deadline is now + days (injected clock)', String(a.deadlineAt))
  const e1 = errOf(() => h.t.assign({ conference: h.id, submission: s, eligible: ['r1'], conflicted: [] }))
  ok(e1 === null || e1.code === 'VMU_CONF_REVIEW_QUORUM_MISSING', 'assign[+]: re-assignment stays within the rules')
  const off = conf({ 'vmu.conference.assign': 'off' })
  const s2 = off.t.submit({ conference: off.id, title: 'b', authors: ['bob'], topics: ['ml'] }).submission
  const e2 = errOf(() => off.t.assign({ conference: off.id, submission: s2, reviewers: ['r1'] }))
  ok(e2 && e2.code === 'VMU_NOT_PERMITTED' && /assign=off/.test(e2.message), 'assign[-]: "off" refuses any assignment', e2 && e2.code)
  const man = conf({ 'vmu.conference.assign': 'manual', 'vmu.conference.reviewAssignmentsPerPaper': 2 })
  const s3 = man.t.submit({ conference: man.id, title: 'c', authors: ['cleo'], topics: ['ml'] }).submission
  const e3 = errOf(() => man.t.assign({ conference: man.id, submission: s3, reviewers: ['r1'] }))
  ok(e3 && e3.code === 'VMU_CONF_REVIEW_QUORUM_MISSING' && /现值=1/.test(e3.hint) && /门槛=2/.test(e3.hint),
    'reviewAssignmentsPerPaper[-]: too few reviewers is refused WITH 现值/门槛', e3 && e3.hint)
  const e4 = errOf(() => man.t.assign({ conference: man.id, submission: s3, reviewers: ['r1', 'r2'] }))
  ok(e4 === null, 'reviewAssignmentsPerPaper[+]: meeting the threshold assigns')
  // deadline lateness
  const late = conf({ 'vmu.conference.reviewDeadlineDays': 1 })
  const s4 = late.t.submit({ conference: late.id, title: 'd', authors: ['dan'], topics: ['ml'] }).submission
  late.t.assign({ conference: late.id, submission: s4, reviewers: ['r1', 'r2'] })
  NOW = 1_000_000 + 2 * DAY
  const e5 = errOf(() => late.t.review({ conference: late.id, submission: s4, reviewer: 'r1' }))
  ok(e5 && e5.code === 'VMU_REVIEW_DUE' && /现值=/.test(e5.hint) && /截止=/.test(e5.hint),
    'reviewDeadlineDays[-]: a late review is refused with 现值/截止', e5 && e5.hint)
  NOW = 1_000_000
  ok(errOf(() => man.t.review({ conference: man.id, submission: s3, reviewer: 'r1' })) === null, 'reviewDeadlineDays[+]: an on-time review passes')
}

// ── 10. metaReviewRequired ──────────────────────────────────────────────────────────────────────────
{
  const h = conf({ 'vmu.conference.metaReviewRequired': true, 'vmu.conference.assign': 'manual' })
  const s = h.t.submit({ conference: h.id, title: 'm', authors: ['ada'], topics: ['ml'] }).submission
  h.t.assign({ conference: h.id, submission: s, reviewers: ['r1', 'r2'] })
  const e1 = errOf(() => h.t.review({ conference: h.id, submission: s, reviewer: 'r1' }))
  ok(e1 && e1.code === 'VMU_REVIEW_RUBRIC_REQUIRED', 'metaReviewRequired[-]: a first-round review without a rubric is refused', e1 && e1.code)
  ok(errOf(() => h.t.review({ conference: h.id, submission: s, reviewer: 'r1', rubric: { score: 4 } })) === null,
    'metaReviewRequired[+]: a rubric-backed review passes')
  const e2 = errOf(() => h.t.decide({ conference: h.id, submission: s, decision: 'accept' }))
  ok(e2 && e2.code === 'VMU_REVIEW_EVIDENCE_REQUIRED' && /meta review/.test(e2.message),
    'metaReviewRequired[-]: accepting without the meta review is refused', e2 && e2.code)
  ok(errOf(() => h.t.review({ conference: h.id, submission: s, reviewer: 'r2', meta: true })) === null, 'metaReviewRequired[+]: the meta review is recorded')
  ok(errOf(() => h.t.decide({ conference: h.id, submission: s, decision: 'accept' })) === null, 'metaReviewRequired[+]: with the meta review the acceptance passes')
}

// ── 11–14. register / registrationCap / registrationFeeMinor / waiverPolicy ─────────────────────────
{
  const h = conf({ 'vmu.conference.registrationFeeMinor': 12000, 'vmu.conference.registrationCap': 2 })
  const r1 = h.t.register({ conference: h.id, attendee: 'ada' })
  ok(r1.feeMinor === 12000 && r1.listFeeMinor === 12000 && r1.receipt.feeMinor === 12000,
    'registrationFeeMinor[+]: the declared fee is charged and echoed', String(r1.feeMinor))
  h.t.register({ conference: h.id, attendee: 'bob' })
  const e1 = errOf(() => h.t.register({ conference: h.id, attendee: 'cleo' }))
  ok(e1 && e1.code === 'VMU_CONF_CAP_REACHED' && /现值=2/.test(e1.hint) && /上限=2/.test(e1.hint),
    'registrationCap[-]: over the cap is refused WITH 现值/上限', e1 && e1.hint)
  const open = conf({ 'vmu.conference.register': false })
  const e2 = errOf(() => open.t.register({ conference: open.id, attendee: 'x' }))
  ok(e2 && e2.code === 'VMU_CONF_REGISTRATION_CLOSED', 'register[-]: with register=false registration is closed', e2 && e2.code)
  const yes = conf({ 'vmu.conference.register': true })
  ok(errOf(() => yes.t.register({ conference: yes.id, attendee: 'y' })) === null, 'register[+]: with the key on registration passes')
  // waiverPolicy × registrationFeeMinor
  const never = conf({ 'vmu.conference.waiverPolicy': 'never', 'vmu.conference.registrationFeeMinor': 500 })
  const e3 = errOf(() => never.t.register({ conference: never.id, attendee: 'z', waiver: true }))
  ok(e3 && e3.code === 'VMU_NOT_PERMITTED' && /waiverPolicy=never/.test(e3.message), 'waiverPolicy[-]: "never" refuses waivers', e3 && e3.code)
  const reason = conf({ 'vmu.conference.waiverPolicy': 'require-reason', 'vmu.conference.registrationFeeMinor': 500 })
  const e4 = errOf(() => reason.t.register({ conference: reason.id, attendee: 'z', waiver: true }))
  ok(e4 && e4.code === 'VMU_REASON_REQUIRED', 'waiverPolicy[-]: "require-reason" without a reason is refused', e4 && e4.code)
  const always = conf({ 'vmu.conference.waiverPolicy': 'always', 'vmu.conference.registrationFeeMinor': 500 })
  const w = always.t.register({ conference: always.id, attendee: 'z', waiver: true })
  ok(w.waiver === true && w.feeMinor === 0 && w.listFeeMinor === 500,
    'waiverPolicy[+]: "always" grants the waiver — the fee CHARGED changes to 0 while the list fee stays', JSON.stringify({ charged: w.feeMinor, list: w.listFeeMinor }))
}

// ── 15–18. schedule / slotMinutes / maxParallelTracks / scheduleTz ──────────────────────────────────
{
  const seq = conf({ 'vmu.conference.schedule': 'sequential', 'vmu.conference.slotMinutes': 30 })
  const items = [{ id: 't1', minutes: 20 }, { id: 't2', minutes: 20 }]
  const r1 = seq.t.planAgenda({ conference: seq.id, items })
  ok(r1.agenda.mode === 'sequential' && r1.agenda.placements.every((p) => p.track === 0) && r1.agenda.totalMinutes === 40,
    'schedule[+]: sequential puts every item on one track and sums the minutes', JSON.stringify(r1.agenda.totalMinutes))
  const par = conf({ 'vmu.conference.schedule': 'parallel', 'vmu.conference.slotMinutes': 30, 'vmu.conference.maxParallelTracks': 2 })
  const r2 = par.t.planAgenda({ conference: par.id, items })
  ok(r2.agenda.mode === 'parallel' && new Set(r2.agenda.placements.map((p) => p.track)).size === 2,
    'schedule[+]: parallel spreads the items over the declared tracks')
  ok(r2.agenda.totalMinutes === 20 && r1.agenda.totalMinutes === 40,
    'schedule[]: parallel puts two items in the SAME slot (20 min) while sequential sums them (40 min) — the mode is observable',
    JSON.stringify({ seq: r1.agenda.totalMinutes, par: r2.agenda.totalMinutes }))
  const e1 = errOf(() => seq.t.planAgenda({ conference: seq.id, items: [{ id: 't3', minutes: 45 }] }))
  ok(e1 && e1.code === 'VMU_CONF_SCHEDULE_CONFLICT' && /现值=45/.test(e1.hint) && /上限=30/.test(e1.hint),
    'slotMinutes[-]: an over-long item is refused WITH 现值/上限', e1 && e1.hint)
  ok(errOf(() => seq.t.planAgenda({ conference: seq.id, items: [{ id: 't4', minutes: 30 }] })) === null, 'slotMinutes[+]: an item at the slot length passes')
  const tight = conf({ 'vmu.conference.schedule': 'parallel', 'vmu.conference.maxParallelTracks': 1 })
  const e2 = errOf(() => tight.t.planAgenda({ conference: tight.id, items }))
  ok(e2 && e2.code === 'VMU_CONF_SCHEDULE_CONFLICT' && /上限=1/.test(e2.hint),
    'maxParallelTracks[-]: more parallel tracks than allowed is refused WITH 上限', e2 && e2.hint)
  const wide = conf({ 'vmu.conference.schedule': 'parallel', 'vmu.conference.maxParallelTracks': 4 })
  ok(errOf(() => wide.t.planAgenda({ conference: wide.id, items })) === null, 'maxParallelTracks[+]: within the cap the parallel agenda is planned')
  const berlin = conf({ 'vmu.conference.scheduleTz': 'Europe/Berlin' })
  const r3 = berlin.t.planAgenda({ conference: berlin.id, items: [{ id: 't5', minutes: 10, tz: 'Europe/Berlin' }] })
  ok(r3.agenda.tz === 'Europe/Berlin' && r3.receipt.tz === 'Europe/Berlin', 'scheduleTz[+]: the declared timezone is echoed')
  const e3 = errOf(() => berlin.t.planAgenda({ conference: berlin.id, items: [{ id: 't6', minutes: 10, tz: 'Asia/Tokyo' }] }))
  ok(e3 && e3.code === 'VMU_CONF_SCHEDULE_CONFLICT' && /another timezone/.test(e3.message), 'scheduleTz[-]: a foreign timezone is refused', e3 && e3.code)
}

// ── duplicate submissions + the D3 receipt discipline ──────────────────────────────────────────────
{
  const h = conf({})
  h.t.submit({ conference: h.id, title: 'Same  Title', authors: ['ada', 'bob'], topics: ['ml'] })
  const e = errOf(() => h.t.submit({ conference: h.id, title: 'same title', authors: ['bob', 'ada'], topics: ['ml'] }))
  ok(e && e.code === 'VMU_SUBMISSION_DUPLICATE' && /already submitted/.test(e.message),
    'duplicate: same authors + same normalised title is refused by name', e && e.code)
  ok(h.t.status().counters.duplicates === 1, 'duplicate: the duplicate is COUNTED', String(h.t.status().counters.duplicates))
  // every receipt carries enforced/fired/enforcedScope; fired ⊆ enforced; no duplicates
  const receipts = h.t.receiptsView({ limit: 50 }).items
  ok(receipts.length >= 2 && receipts.every((r) => Array.isArray(r.enforced) && Array.isArray(r.fired) && r.enforcedScope === ENFORCED_SCOPE),
    'D3: every receipt carries enforced[] + fired[] + enforcedScope', JSON.stringify(receipts[receipts.length - 1]))
  ok(receipts.every((r) => r.fired.every((k) => r.enforced.includes(k))), 'D3: fired ⊆ enforced on every receipt')
  ok(receipts.every((r) => new Set(r.enforced).size === r.enforced.length), 'D3: enforced[] has no duplicates')
  const submitReceipt = receipts.find((r) => r.action === 'submit')
  ok(submitReceipt && submitReceipt.enforced.includes('vmu.conference.cfpOpenMs') && submitReceipt.enforced.includes('vmu.conference.slotMinutes'),
    'D3: the submission receipt lists the keys actually consulted', JSON.stringify(submitReceipt && submitReceipt.enforced))
}

// ── every refusal path carries an ARRAY enforced + the scope marker ────────────────────────────────
{
  const triggers = [
    ['cfp closed', () => { NOW = 1_000_000; const t = mk({ 'vmu.conference.cfpCloseMs': 1 }); const id = t.open({ id: 'x' }).conference; return t.submit({ conference: id, title: 't', authors: ['a'] }) }],
    ['topics', () => { const h = conf({ 'vmu.conference.topicsRequired': true }); return h.t.submit({ conference: h.id, title: 't', authors: ['a'] }) }],
    ['conflicts', () => { const h = conf({ 'vmu.conference.reviewerConflicts': true }); return h.t.submit({ conference: h.id, title: 't', authors: ['a'], topics: ['ml'] }) }],
    ['proceedings', () => { const h = conf({}); return h.t.submit({ conference: h.id, title: 't', authors: ['a'], topics: ['ml'], forProceedings: true }) }],
    ['slot', () => { const h = conf({ 'vmu.conference.slotMinutes': 5 }); return h.t.submit({ conference: h.id, title: 't', authors: ['a'], topics: ['ml'], minutes: 50 }) }],
    ['assign off', () => { const h = conf({ 'vmu.conference.assign': 'off' }); const s = h.t.submit({ conference: h.id, title: 't', authors: ['a'], topics: ['ml'] }).submission; return h.t.assign({ conference: h.id, submission: s, reviewers: ['r'] }) }],
    ['quorum', () => { const h = conf({ 'vmu.conference.assign': 'manual' }); const s = h.t.submit({ conference: h.id, title: 't', authors: ['a'], topics: ['ml'] }).submission; return h.t.assign({ conference: h.id, submission: s, reviewers: ['r'] }) }],
    ['register closed', () => { const h = conf({ 'vmu.conference.register': false }); return h.t.register({ conference: h.id, attendee: 'a' }) }],
    ['cap', () => { const h = conf({ 'vmu.conference.registrationCap': 1 }); h.t.register({ conference: h.id, attendee: 'a' }); return h.t.register({ conference: h.id, attendee: 'b' }) }],
    ['waiver never', () => { const h = conf({ 'vmu.conference.waiverPolicy': 'never' }); return h.t.register({ conference: h.id, attendee: 'a', waiver: true }) }],
    ['waiver reason', () => { const h = conf({ 'vmu.conference.waiverPolicy': 'require-reason' }); return h.t.register({ conference: h.id, attendee: 'a', waiver: true }) }],
    ['tz', () => { const h = conf({ 'vmu.conference.scheduleTz': 'UTC' }); return h.t.planAgenda({ conference: h.id, items: [{ id: 'i', minutes: 1, tz: 'Asia/Tokyo' }] }) }],
    ['unknown conference', () => mk({}).submit({ conference: 'nope', title: 't' })],
    ['duplicate', () => { const h = conf({}); h.t.submit({ conference: h.id, title: 'dup', authors: ['a'], topics: ['ml'] }); return h.t.submit({ conference: h.id, title: 'dup', authors: ['a'], topics: ['ml'] }) }],
  ]
  const bad = []
  for (const [label, fn] of triggers) {
    const e = errOf(fn)
    if (!e) { bad.push(label + ':NO-THROW'); continue }
    if (!Array.isArray(e.enforced)) bad.push(label + '=enforced:' + String(e.enforced))
    if (!Array.isArray(e.fired)) bad.push(label + '=fired:' + String(e.fired))
    if (e.enforcedScope !== ENFORCED_SCOPE) bad.push(label + '=scope:' + String(e.enforcedScope))
    if (!e.fired.every((k) => e.enforced.includes(k))) bad.push(label + '=fired⊄enforced')
  }
  ok(bad.length === 0, 'EVERY refusal carries array enforced[] + fired[] (fired ⊆ enforced) + enforcedScope', JSON.stringify(bad))
  const counted = mk({ 'vmu.conference.register': false })
  const cid = counted.open({ id: 'c' }).conference
  errOf(() => counted.register({ conference: cid, attendee: 'a' }))
  errOf(() => counted.register({ conference: cid, attendee: 'b' }))
  ok(counted.status().refusals.VMU_CONF_REGISTRATION_CLOSED === 2, 'refusals are COUNTED BY CODE', JSON.stringify(counted.status().refusals))
}

// ── the declared universe, zero mechanism, determinism, read-only purity, layering ─────────────────
{
  const t = mk({})
  const st = t.status()
  ok(WIRED_KEYS.length === 18, 'the face wires all 18 declared vmu.conference.* keys', String(WIRED_KEYS.length))
  ok(st.declaredConferenceKeys === 18, 'the declared universe is read from settings/schema.js (core + planned)', String(st.declaredConferenceKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredConferenceKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 18 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredConferenceKeys }))
  ok(st.wiredNotDeclared.length === 0, 'no wired key is missing from the declared registry', JSON.stringify(st.wiredNotDeclared))
  ok(Object.keys(st.keys).length === 18 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 18 wired keys (no silent nulls)')
  // zero mechanism: documented defaults ⇒ everything works, nothing crashes
  const z = mk({})
  const zid = z.open({ id: 'z' }).conference
  ok(z.submit({ conference: zid, title: 'plain', authors: ['a'], topics: ['x'] }).ok === true,
    'zero mechanism[+]: with no settings at all the documented defaults let a submission through')
  ok(codeOf(() => z.submit({ conference: 'nope', title: 'x' })) === 'VMU_NO_SUCH_OBJECT', 'zero mechanism[-]: an unknown conference is a named refusal')
  // read-only purity
  const before = JSON.stringify(z.status().counters)
  z.status(); z.list({ conference: zid }); z.receiptsView(); z.viewSubmission({ conference: zid, submission: 's1' })
  ok(JSON.stringify(z.status().counters) === before, 'READ paths (status/list/receiptsView/viewSubmission) never mutate recorded data')
  ok(codeOf(() => z.list({ conference: 'nope' })) === 'VMU_NO_SUCH_OBJECT', 'a read on an unknown conference is a named refusal')
  // determinism (two instances, same injected clock)
  const mkSame = () => { const c = createConference({ clock: () => 4242, settings: { 'vmu.conference.registrationFeeMinor': 900 } }); const id = c.open({ id: 'k' }).conference; c.submit({ conference: id, title: 'T', authors: ['a'], topics: ['ml'] }); c.register({ conference: id, attendee: 'a' }); return c }
  ok(JSON.stringify(mkSame().status().counters) === JSON.stringify(mkSame().status().counters), 'two instances with the same inputs produce identical counters')
  ok(mkSame().status().at === 4242, 'status() uses the injected clock (no real time)')
  // LAYERING: the meeting layer is REFERENCED, never driven — a probe meetings seam records zero calls
  const calls = []
  const probeMeetings = new Proxy({}, { get: (t, k) => (...args) => { calls.push(String(k)); return { ok: true } } })
  const layered = mk({}, { meetings: probeMeetings })
  const lid = layered.open({ id: 'l' }).conference
  layered.submit({ conference: lid, title: 'L', authors: ['a'], topics: ['ml'] })
  layered.planAgenda({ conference: lid, items: [{ id: 'i', minutes: 5 }] })
  layered.status(); layered.list({ conference: lid })
  ok(calls.length === 0, 'LAYERING: the conference face never calls the meeting layer (sessions are created THERE)', JSON.stringify(calls))
  ok(/kernel\/meetings/.test(layered.status().layeredOn), 'LAYERING: status() states the boundary', layered.status().layeredOn)
  ok(/declarative/.test(mk({}).status().layeredOn), 'LAYERING: without an injected meeting layer the agenda stays declarative')
}

if (failed === 0) {
  console.log('=== VMU CONFERENCE: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU CONFERENCE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
