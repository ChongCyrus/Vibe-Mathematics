// tests/vmu-recruit.test.mjs — independent test for kernel/recruit.js (batch-2 slice 5).
// Scenarios: S-1 unmapped title refusal, seat overflow, probation not due, reason-required rejection,
// offer expiry, scoring aggregates + rationale requirement, counted truncation, zero-config, determinism,
// read-only views.
import { createRecruit, aggregate } from '../vibe-math-vmu/kernel/recruit.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, current: e && e.current, limit: e && e.limit, remainingMs: e && e.remainingMs, missing: e && e.missing } } }

let now = 1000

// SEATING FIX (Round 32): `confirm` now SEATS the member in the kernel roster, so a roster must be supplied.
// The turn face reads that roster; before the fix nothing populated it and the institute idled with `no-members`.
// This fake records every seating AND the wake events, so both probes below can count them.
const mkRoster = () => {
  const seated = []
  const wakes = []
  return {
    seated, wakes,
    async assignRole(id, slot) {
      const prior = seated.find((x) => x.id === id && x.slot === slot)
      if (prior) return { ok: true, id, slot, unchanged: true }   // idempotent: a re-seat is not a second wake
      seated.push({ id, slot })
      wakes.push({ id, slot })
      return { ok: true, id, slot }
    },
  }
}
// The default harness ALWAYS supplies a roster, because `confirm` now SEATS the member; a test that wants the
// no-roles case passes `{ members: null }` explicitly (probe P2). `mkAsync` is kept as an alias so the probes read
// as what they are testing.
const mk = (settings = {}, opts = {}) => {
  const roster = Object.prototype.hasOwnProperty.call(opts, 'members') ? opts.members : mkRoster()
  const api = createRecruit({ clock: () => now, settings, listCap: 100, ...opts, members: roster })
  api.__roster = roster
  return api
}
const mkAsync = (settings = {}, opts = {}) => mk(settings, opts)
const throwsAsync = async (fn) => { try { await fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, remainingMs: e && e.remainingMs } } }

// 0) ROUND 217: the appointment/term family (vmu.roles.*) — ten settings, each enforced here
{
  const w = mk({
    'vmu.roles.slotIdPattern': '^[a-z]+$',
    'vmu.roles.termDefaultMs': 2000,
    'vmu.roles.termMaxMs': 1500,
    'vmu.roles.termRenewable': false,
    'vmu.roles.recallQuorum': 0.5,
    'vmu.roles.recallCoolDownMs': 10000,
    'vmu.roles.actingMaxMs': 100,
    'vmu.roles.actingNeedsReason': true,
    'vmu.roles.separationPairs': [{ a: 'planner', b: 'verifier' }],
    'vmu.roles.promotionNeedsEvidence': true,
  })
  // slotIdPattern: the declared pattern decides what counts as a slot id
  ok(throws(() => w.openPosting({ slot: 'a-b', seats: 1 })).code === 'VMU_RECRUIT_SLOT_UNKNOWN',
    'slotIdPattern[-]: an id outside the declared pattern is refused by name')
  ok(w.openPosting({ slot: 'planner', seats: 2 }).slot === 'planner', 'slotIdPattern[+]: an id inside the pattern passes')
  // termDefaultMs + termMaxMs: the default term is recorded and CLAMPED, and the clamp is disclosed
  const ap = w.apply({ postingId: w.openPosting({ slot: 'planner', seats: 2 }).id, candidate: 'm1' })
  const of = w.offer({ applicationId: ap.id })
  const acc = w.accept({ offerId: of.id, by: 'acad' })
  ok(acc.termUntil === now + 1500 && acc.termClamped === true,
    'termDefaultMs[+] + termMaxMs: a 2000ms default term is CLAMPED to the 1500ms maximum and says so', JSON.stringify(acc))
  // termRenewable[-]
  ok(throws(() => w.renewTerm({ memberId: 'm1' })).code === 'VMU_ROLE_TERM_NOT_RENEWABLE',
    'termRenewable[-]: a non-renewable term refuses renewal by name')
  // recallQuorum[-] and [+], then recallCoolDownMs[-]
  ok(throws(() => w.recall({ memberId: 'm1', support: 1, total: 4 })).code === 'VMU_ROLE_RECALL_QUORUM',
    'recallQuorum[-]: support below the declared quorum is refused by name')
  ok(w.recall({ memberId: 'm1', support: 3, total: 4 }).recalled === true, 'recallQuorum[+]: enough support recalls')
  ok(throws(() => w.recall({ memberId: 'm1', support: 4, total: 4 })).code === 'VMU_ROLE_RECALL_COOLDOWN',
    'recallCoolDownMs[-]: a second recall inside the cool-down is refused by name')
  // actingNeedsReason[-] and actingMaxMs
  ok(throws(() => w.actAsChair({ memberId: 'm1' })).code === 'VMU_REASON_REQUIRED',
    'actingNeedsReason[-]: acting without a reason is refused by name')
  const act = w.actAsChair({ memberId: 'm1', ms: 5000, reason: 'chair unavailable' })
  ok(act.actingUntil === now + 100 && act.clamped === true,
    'actingMaxMs: a requested 5000ms acting window is CLAMPED to the 100ms maximum', JSON.stringify(act))
  // promotionNeedsEvidence[-] and separationPairs[-] on the promotion path
  ok(throws(() => w.promote({ memberId: 'm1', toSlot: 'verifier', evidence: 'cv' })).code === 'VMU_ROLE_SEPARATION_VIOLATED',
    'separationPairs[-]: promoting into the paired slot is refused by name')
  const ap2 = w.apply({ postingId: w.openPosting({ slot: 'analyst', seats: 1 }).id, candidate: 'm2' })
  const of2 = w.offer({ applicationId: ap2.id })
  w.accept({ offerId: of2.id, by: 'acad' })
  ok(throws(() => w.promote({ memberId: 'm2', toSlot: 'verifier' })).code === 'VMU_ROLE_EVIDENCE_REQUIRED',
    'promotionNeedsEvidence[-]: a promotion without evidence is refused by name')
  ok(w.promote({ memberId: 'm2', toSlot: 'verifier', evidence: 'peer review' }).to === 'verifier',
    'promotionNeedsEvidence[+]: with evidence the promotion goes through')
  // separationPairs[+] on the hiring path: the SAME member cannot take the paired slot
  const ap3 = w.apply({ postingId: w.openPosting({ slot: 'planner', seats: 1 }).id, candidate: 'm3' })
  const of3 = w.offer({ applicationId: ap3.id })
  w.accept({ offerId: of3.id, by: 'acad' })   // m3 now holds planner
  const ap4 = w.apply({ postingId: w.openPosting({ slot: 'verifier', seats: 1 }).id, candidate: 'm3' })
  const of4 = w.offer({ applicationId: ap4.id })
  ok(throws(() => w.accept({ offerId: of4.id, by: 'acad' })).code === 'VMU_ROLE_SEPARATION_VIOLATED',
    'separationPairs[-]: hiring a member into the other half of a declared pair it already holds is refused by name')
}

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
  const w = mk({ 'vmu.admission.seatsMax': 1 })
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
  ok((await w.confirm({ memberId: 'acad', by: 'chair' })).confirmed === true, 'confirm works when probation is zero-length')
}

// 4) probation not over ⇒ named refusal with remaining time; then it becomes due
{
  const w = mk({ 'vmu.admission.probationMs': 5000 })
  const p = w.openPosting({ slot: 'fellow', seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: 'r-2' })
  const o = w.offer({ applicationId: a.id })
  w.accept({ offerId: o.id, by: 'r-2' })
  now = 3000
  const r = await throwsAsync(() => w.confirm({ memberId: 'r-2', by: 'chair' }))
  ok(r.threw && r.code === 'VMU_RECRUIT_PROBATION_NOT_DUE' && r.remainingMs === 3000, 'probation early confirm refused with remaining')
  ok(w.probation({ memberId: 'r-2' }).remainingMs === 3000, 'probation() reports remaining (read-only)')
  now = 6500
  ok((await w.confirm({ memberId: 'r-2', by: 'chair' })).confirmedAt === 6500, 'confirm succeeds after probation elapsed')
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
  const w = mk({ 'vmu.admission.requireEvidence': true })
  const p = w.openPosting({ slot: 'researcher', seats: 1 })
  const r = throws(() => w.apply({ postingId: p.id, candidate: 'a1' }))
  ok(r.threw && r.code === 'VMU_RECRUIT_NOT_APPLIED' && r.missing.includes('evidence'), 'evidence required to apply')
  const cap = mk({ 'vmu.admission.maxCandidates': 1 })
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
  const w = mk({ 'vmu.admission.scoreAggregate': 'median' })
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


// ── ROUND 267: policy, decideBy, needsHuman, probationPermissions (volume 17 §L266-271) ─────────────────────
{
  // the defaults are the volume defaults, and they change nothing
  const d = mk({}).status().declared
  ok(d && d.policy === 'closed' && d.decideBy === 'manager' && d.needsHuman === false && d.probationPermissions.length === 0,
    'recruit defaults: closed policy, manager decides, no human requirement, no probation permissions', d)

  // a whole recruitment, so the accepting step is reachable
  const run = (settings) => {
    const r = mk(Object.assign({ 'vmu.roles.map': { dev: 'slot-dev' } }, settings || {}))
    const p = r.openPosting({ slot: 'slot-dev', seats: 1 })
    const a = r.apply({ postingId: p.id, candidate: 'c-1' })
    const o = r.offer({ applicationId: a.id })
    return { r, o }
  }

  // the control: with the declaration off, an acceptance with no approver is fine
  const loose = run({})
  ok(loose.r.accept({ offerId: loose.o.id }).ok === undefined || loose.r.accept({ offerId: loose.o.id }).ok === true,
    'needsHuman[off]: an acceptance with no named approver is accepted, as before')

  // declared, it refuses BY NAME
  const strict = run({ 'vmu.admission.needsHuman': true })
  const noApprover = throws(() => strict.r.accept({ offerId: strict.o.id }))
  ok(noApprover.threw && noApprover.code === 'VMU_RECRUIT_NEEDS_HUMAN',
    'needsHuman[on]: an acceptance with no human approver is refused by name', noApprover.code)
  ok(strict.r.accept({ offerId: strict.o.id, by: 'office' }).slot !== undefined,
    'needsHuman[on]: naming an approver lets the same acceptance through')

  // the two enums are validated and reported, not silently ignored
  const declared = mk({ 'vmu.admission.policy': 'open', 'vmu.admission.decideBy': 'vote' }).status().declared
  ok(declared.policy === 'open' && declared.decideBy === 'vote', 'policy/decideBy: the declared method and decider are reported', declared)
  const bogus = mk({ 'vmu.admission.policy': 'nonsense', 'vmu.admission.decideBy': 'nonsense' }).status().declared
  ok(bogus.policy === 'closed' && bogus.decideBy === 'manager', 'policy/decideBy: an unrecognised value falls back to the declared default')
}


// ── SEATING FIX PROBES (Round 32) ──────────────────────────────────────────────────────────────────────
// P1: the wake event must fire EXACTLY ONCE per member. `task/assign` is a WAKE action, and a replayed
// confirm calling it twice would read as "the same member was called twice" - a stranger fault than no-members.
{
  const w = mkAsync()
  const p = w.openPosting({ slot: "fellow", seats: 2 })
  const a = w.apply({ postingId: p.id, candidate: "r-9" })
  const o = w.offer({ applicationId: a.id })
  w.accept({ offerId: o.id, by: "r-9" })
  const first = await w.confirm({ memberId: "r-9", by: "chair" })
  const second = await w.confirm({ memberId: "r-9", by: "chair" })
  ok(first.seated === true, "P1: a confirmed member is actually SEATED in the kernel roster")
  ok(w.__roster.seated.length === 1, "P1: the roster holds the member exactly once")
  ok(w.__roster.wakes.length === 1, "P1: the wake event fired EXACTLY ONCE across two confirms")
  ok(second.confirmed === true && second.seated === true, "P1: the replay still reports success without re-waking")
}
// P2: with NO roles declared there is nowhere to seat anyone, and that must be a DISTINCT named refusal -
// "the system has no roles wired" must not read as "you do not qualify". A full slot is a different failure.
{
  const w = mkAsync({}, { members: null })
  const p = w.openPosting({ slot: "fellow", seats: 1 })
  const a = w.apply({ postingId: p.id, candidate: "r-8" })
  const o = w.offer({ applicationId: a.id })
  w.accept({ offerId: o.id, by: "r-8" })
  const r = await throwsAsync(() => w.confirm({ memberId: "r-8", by: "chair" }))
  ok(r.threw === true && r.code === "VMU_ENGINE_UNAVAILABLE", "P2: no declared roles refuses by NAME (VMU_ENGINE_UNAVAILABLE)")
  ok(/no role slots/.test(r.msg || ""), "P2: the refusal says the roles are not wired, not that the hire failed")
}
// ── SLV regression: a PACK declares slots AFTER the kernel (and its admission) was constructed ────────────────
// Measured on a real DSH host: `declareSlots()` REPLACES the kernel's `members`; a value captured by `createRecruit`
// stayed null ⇒ confirm refused "no role slots" after the v3 pack had declared three, and a retry returned a FAKE
// `seated:true` because `confirmedAt` had been written before the seating failed.
{
  const { createKernel } = await import('../vibe-math-vmu/kernel/index.js')
  const chain = async (api, candidate) => {
    const p = api.openPosting({ slot: 'planner', seats: 1 })
    const a = api.apply({ postingId: p.id, candidate })
    api.score({ applicationId: a.id, by: 'chair', score: 0.9, rationale: 'slv regression' })
    const o = api.offer({ applicationId: a.id })
    await api.accept({ offerId: o.id, by: 'chair' })
    return candidate
  }
  const k = createKernel({ clock: () => now })
  k.declareSlots([
    { id: 'planner', label: 'planning', capacity: 1, permissions: ['plan'] },
    { id: 'verifier', label: 'verification', capacity: 1, permissions: ['vote'] },
  ])
  const who = await chain(k.admission, 'planner-a')
  const seated = await k.admission.confirm({ memberId: who })   // NO slot in the request: the real tool shape
  ok(seated.ok !== false && seated.seated === true && seated.slot === 'planner',
    'slots declared by a LATER pack: confirm (no slot arg) seats the member')
  ok(k.members.roster().some((m) => m.id === who && m.state === 'live'),
    '★ the KERNEL roster really has the member live (the receipt is not the only witness)')
  // Reverse: no slots anywhere ⇒ the named refusal, and a REPLAY must not turn the failed attempt into seated:true.
  const k2 = createKernel({ clock: () => now })
  const who2 = await chain(k2.admission, 'planner-b')
  const first = await throwsAsync(() => k2.admission.confirm({ memberId: who2 }))
  ok(first.threw === true && first.code === 'VMU_ENGINE_UNAVAILABLE' && /no role slots/.test(first.msg || ''),
    'no slots: confirm refuses by NAME (VMU_ENGINE_UNAVAILABLE)')
  ok(k2.admission.status().items.find((s) => s.memberId === who2).confirmed === false,
    '★ a FAILED confirm leaves no partially-written confirmed state')
  const replay = await throwsAsync(() => k2.admission.confirm({ memberId: who2 }))
  ok(replay.threw === true && replay.code === 'VMU_ENGINE_UNAVAILABLE',
    '★ the replay still refuses — it must NOT return a fake seated:true for an empty roster')
}
console.log('=== VMU RECRUIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
