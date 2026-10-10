// tests/vmu-recruit.test.mjs — independent test for kernel/recruit.js (batch-2 slice 5).
// Scenarios: S-1 unmapped title refusal, seat overflow, probation not due, reason-required rejection,
// offer expiry, scoring aggregates + rationale requirement, counted truncation, zero-config, determinism,
// read-only views.
import { createRecruit, aggregate } from '../vibe-math-vmu/kernel/recruit.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, current: e && e.current, limit: e && e.limit, remainingMs: e && e.remainingMs, missing: e && e.missing } } }

let now = 1000
const mk = (settings = {}, opts = {}) => createRecruit({ clock: () => now, settings, listCap: 100, ...opts })

// 1) S-1: kernel does not know titles — a free-form title must be mapped or refused by name
{
  const w = mk()
  const r = throws(() => w.openPosting({ slot: '高级研究员', seats: 1 }))
  ok(r.threw && r.code === 'VMU_RECRUIT_SLOT_UNKNOWN' && !!r.hint, 'unmapped title refused by name + hint')
  const mapped = mk({ 'vmu.roles.map': { '高级研究员': 'researcher' } })
  ok(mapped.openPosting({ slot: '高级研究员', seats: 1 }).slot === 'researcher', 'mapped title resolves to its slot')
  ok(mk().openPosting({ slot: 'researcher', seats: 1 }).slot === 'researcher', 'slot-like id passes through')
}

// 2) seat overflow refuses with current/limit (openPosting path)
{
  const w = mk({ 'vmu.recruit.seatsMax': 1 })
  w.openPosting({ slot: 'researcher', seats: 1 })
  const r = throws(() => w.openPosting({ slot: 'researcher', seats: 1 }))
  ok(r.threw && r.code === 'VMU_RECRUIT_SEATS_EXCEEDED' && r.limit === 1, 'over-seating refused with limit')
}

// 3) happy path: apply → score → offer → accept (no probation) → confirm
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 2 })
  const a = w.apply({ postingId: p.id, candidate: 'acad' })
  const s = w.score({ applicationId: a.id, by: 'chair', score: 0.9, rationale: 'strong record' })
  ok(s.aggregate === 0.9 && s.scores === 1, 'score aggregates')
  const o = w.offer({ applicationId: a.id })
  const acc = w.accept({ offerId: o.id, by: 'acad' })
  ok(acc.memberId === 'acad' && acc.slot === 'researcher' && acc.confirmed === false, 'accept creates a probationary seat')
  ok(w.confirm({ memberId: 'acad', by: 'chair' }).confirmed === true, 'confirm works when probation is zero-length')
}

// 4) probation not over ⇒ named refusal with remaining time; then it becomes due
{
  const w = mk({ 'vmu.recruit.probationMs': 5000 })
  const p = w.openPosting({ slot: 'fellow', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'r-2' })
  const o = w.offer({ applicationId: a.id })
  w.accept({ offerId: o.id, by: 'r-2' })
  now = 3000
  const r = throws(() => w.confirm({ memberId: 'r-2', by: 'chair' }))
  ok(r.threw && r.code === 'VMU_RECRUIT_PROBATION_NOT_DUE' && r.remainingMs === 3000, 'probation early confirm refused with remaining')
  ok(w.probation({ memberId: 'r-2' }).remainingMs === 3000, 'probation() reports remaining (read-only)')
  now = 6500
  ok(w.confirm({ memberId: 'r-2', by: 'chair' }).confirmedAt === 6500, 'confirm succeeds after probation elapsed')
  now = 1000
}

// 5) rejection needs a reason (named refusal naming the missing field)
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'x' })
  const o = w.offer({ applicationId: a.id })
  const r = throws(() => w.reject({ offerId: o.id }))
  ok(r.threw && r.code === 'VMU_RECRUIT_REASON_REQUIRED' && r.missing.includes('reason'), 'reasonless rejection refused')
  ok(w.reject({ offerId: o.id, reason: 'not enough evidence' }).status === 'rejected', 'rejection with reason recorded')
}

// 6) offer expiry (injected clock)
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'y' })
  const o = w.offer({ applicationId: a.id, expiresInMs: 1000 })
  now = 2500
  const r = throws(() => w.accept({ offerId: o.id, by: 'y' }))
  ok(r.threw && r.code === 'VMU_RECRUIT_OFFER_EXPIRED', 'expired offer refused by name')
  now = 1000
}

// 7) rationale required for scoring
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'z' })
  const r = throws(() => w.score({ applicationId: a.id, by: 'chair', score: 0.5 }))
  ok(r.threw && r.code === 'VMU_RECRUIT_REASON_REQUIRED', 'score without rationale refused')
}

// 8) evidence requirement + candidate cap
{
  const w = mk({ 'vmu.recruit.requireEvidence': true })
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const r = throws(() => w.apply({ postingId: p.id, candidate: 'a1' }))
  ok(r.threw && r.code === 'VMU_RECRUIT_NOT_APPLIED' && r.missing.includes('evidence'), 'evidence required to apply')
  const cap = mk({ 'vmu.recruit.maxCandidates': 1 })
  const p2 = cap.openPosting({ slot: 'researcher', seats: 2 })
  cap.apply({ postingId: p2.id, candidate: 'c1' })
  const r2 = throws(() => cap.apply({ postingId: p2.id, candidate: 'c2' }))
  ok(r2.threw && r2.code === 'VMU_RECRUIT_SEATS_EXCEEDED' && r2.limit === 1, 'candidate cap refused with limit')
}

// 9) score aggregates: mean / median / trimmed
{
  ok(aggregate([1, 2, 3], 'mean') === 2, 'mean')
  ok(aggregate([1, 2, 3, 4], 'median') === 2.5, 'median')
  ok(aggregate([0, 1, 10], 'trimmed') === 1, 'trimmed drops extremes')
  const w = mk({ 'vmu.recruit.scoreAggregate': 'median' })
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'm1' })
  w.score({ applicationId: a.id, by: 'a', score: 0.2, rationale: 'r' })
  const s = w.score({ applicationId: a.id, by: 'b', score: 0.8, rationale: 'r' })
  ok(s.mode === 'median' && s.aggregate === 0.5, 'configured aggregate mode used')
}

// 10) counted truncation
{
  const w = createRecruit({ clock: () => now, settings: {}, listCap: 2 })
  for (const s of ['s1', 's2', 's3', 's4']) w.openPosting({ slot: s, seats: 1 })
  const l = w.postings()
  ok(l.items.length === 2 && l.total === 4 && l.dropped === 2, 'postings() reports dropped')
}

// 11) zero-config: no settings, slot-like ids only, never crashes on reads
{
  const w = createRecruit()
  ok(w.status().postings === 0 && w.status().staff === 0, 'zero-config status safe')
  const r = throws(() => w.openPosting({}))
  ok(r.threw && r.code === 'VMU_RECRUIT_SLOT_UNKNOWN', 'missing slot refused by name')
}

// 12) read-only views never mutate
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const before = JSON.stringify({ s: w.status(), p: w.postings() })
  w.status(); w.postings()
  ok(JSON.stringify({ s: w.status(), p: w.postings() }) === before, 'reads are side-effect free')
}

// 13) deterministic timestamps from the injected clock
{
  const w = mk()
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  ok(w.postings().items[0].openedAt === 1000, 'openedAt uses the injected clock')
}

console.log('=== VMU RECRUIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
