#!/usr/bin/env node
// vmu BIDDING — the guard for kernel/bidding.js (docs/17 §10 任务竞标, §17 防串谋).
//
// WHAT THIS PROVES (each case runs on a fresh instance with an INJECTED clock — never real time)
//   A. the deadline rail: a bid at/after the deadline is a NAMED refusal that CARRIES the deadline;
//   B. an award needs a RATIONALE (and the refusal names the key that would relax it);
//   C. reputation must NOT price a bid: a reputation weight on the price is refused by name unless the
//      operator explicitly enabled `vmu.auction.reputationInPrice`;
//   D. the price cap cannot be exceeded (the refusal carries 现值/上限);
//   E. an award needs `minBids` (the refusal carries the current count and the floor);
//   F. duplicate bids are VISIBLE: identical prices / identical plans are marked and the marks appear in
//      status() (silence here would hide 围标 ✗);
//   G. every cap counts its DROPS (bids/posts) and the open-auction cap is a named refusal with 现值/上限;
//   H. ZERO MECHANISM: `vmu.auction.enabled` defaults false ⇒ nothing posts, list()/status() still answer,
//      and the refusal is named (never a crash);
//   I. DETERMINISM: two instances fed the same calls produce byte-identical status(), and the `random`
//      close rule is a deterministic hash (no Math.random anywhere);
//   J. READ paths (status/list/candidates/collusion) do not mutate recorded data;
//   K. the close rule declared up front is ENFORCED: awarding a different bidder is a named conflict that
//      names the rule's pick; `best-score` with no scores is undecided rather than a silent fallback.
import { createBidding, CLOSE_RULES, TIE_BREAKS, fingerprintOf, normalizePlan } from '../vibe-math-vmu/kernel/bidding.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const code = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const err = (fn) => { try { fn(); return null } catch (e) { return e } }
const make = (over = {}) => {
  let now = 1000
  const settings = Object.assign(
    { 'vmu.auction.enabled': true, 'vmu.auction.bidWindowMs': 10000, 'vmu.auction.awardNeedsRationale': true },
    over.settings || {})
  const a = createBidding(Object.assign({ clock: () => now }, over, { settings }))
  return { a, at: () => now, set: (t) => { now = t } }
}

// ---- A. the deadline rail --------------------------------------------------------------------------
{
  const { a, set } = make()
  const p = a.post({ taskId: 't-1', budget: 100 })
  ok(p.ok === true && p.postId === 'p1' && p.post.deadlineMs === 11000, 'A1: a post derives its deadline from the window', JSON.stringify(p).slice(0, 140))
  ok(a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'do it' }).ok === true, 'A2: a bid inside the window is accepted')
  set(11000)
  const e = err(() => a.bid({ postId: p.postId, by: 'r-2', price: 5, plan: 'cheaper' }))
  ok(e && e.code === 'VMU_AUCTION_CLOSED', 'A3: a bid at the deadline is refused by name', e && e.code)
  ok(e && /11000/.test(String(e.hint || '') + String(e.message)), 'A4: the refusal CARRIES the deadline', e && e.hint)
  ok(a.status().refusals.VMU_AUCTION_CLOSED === 1, 'A5: the refusal is counted by code')
}

// ---- B. an award needs a rationale -----------------------------------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.closeRule': 'lowest-cost' } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'do it' })
  set(12000)
  a.close({ postId: p.postId })
  const e = err(() => a.award({ postId: p.postId, to: 'r-1' }))
  ok(e && e.code === 'VMU_INVALID_ARGUMENT', 'B1: an award without a rationale is refused', e && e.code)
  ok(e && /awardNeedsRationale/.test(String(e.hint || '')), 'B2: the refusal names the key that governs it', e && e.hint)
  ok(a.award({ postId: p.postId, to: 'r-1', rationale: 'lowest cost, plan credible' }).ok === true, 'B3: with a rationale the award succeeds')
}

// ---- B'. the default rule (best-score) refuses to guess ------------------------------------------
{
  const { a, set } = make()      // no closeRule declared ⇒ documented default best-score
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x' })
  set(12000)
  a.close({ postId: p.postId })
  ok(err(() => a.award({ postId: p.postId, to: 'r-1', rationale: 'only bid' })) !== null,
    'B4: best-score with NO scores refuses instead of silently falling back to price')
  const scored = make()
  const p2 = scored.a.post({ taskId: 't-1', budget: 100 })
  scored.a.bid({ postId: p2.postId, by: 'r-1', price: 10, plan: 'x', score: 0.4 })
  scored.a.bid({ postId: p2.postId, by: 'r-2', price: 30, plan: 'y', score: 0.9 })
  scored.set(12000)
  scored.a.close({ postId: p2.postId })
  ok(scored.a.candidates({ postId: p2.postId }).candidates[0].by === 'r-2',
    'B5: best-score ranks by the recorded score')
  ok(scored.a.award({ postId: p2.postId, to: 'r-2', rationale: 'best score' }).ok === true,
    'B6: the rule pick can be awarded')
}

// ---- C. reputation must not price a bid ------------------------------------------------------------
{
  const { a, set } = make()
  const p = a.post({ taskId: 't-1', budget: 100 })
  const e = err(() => a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x', reputationWeight: 0.9 }))
  ok(e && e.code === 'VMU_TRUST_USE_FORBIDDEN', 'C1: a reputation weight on a price is refused by name (default false)', e && e.code)
  ok(e && /never move a price|S-3/.test(String(e.hint || '')), 'C2: the refusal explains the layering (trust orders, never prices)', e && e.hint)
  ok(err(() => a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x', adjustedPrice: 8 })) !== null,
    'C3: an adjusted price is refused by the same rail')
  const { a: b } = make({ settings: { 'vmu.auction.reputationInPrice': true } })
  const p2 = b.post({ taskId: 't-1', budget: 100 })
  const r = b.bid({ postId: p2.postId, by: 'r-1', price: 10, plan: 'x', reputationWeight: 0.9 })
  ok(r.ok === true && r.reputationInPrice === true, 'C4: with the explicit opt-in, the weight is recorded (loudly)', JSON.stringify(r))
  ok(b.status().reputationInPrice === true, 'C5: status() reports the opt-in')
}

// ---- D. the price cap ------------------------------------------------------------------------------
{
  const { a } = make({ settings: { 'vmu.auction.maxBidCost': 20 } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  const e = err(() => a.bid({ postId: p.postId, by: 'r-1', price: 21, plan: 'x' }))
  ok(e && e.code === 'VMU_AUCTION_INVALID_BID', 'D1: exceeding priceCap is refused', e && e.code)
  ok(e && /现值=21/.test(String(e.hint || '')) && /上限=20/.test(String(e.hint || '')), 'D2: the refusal gives 现值 and 上限', e && e.hint)
  ok(a.bid({ postId: p.postId, by: 'r-1', price: 20, plan: 'x' }).ok === true, 'D3: exactly at the cap is allowed')
  ok(code(() => a.bid({ postId: p.postId, by: 'r-2', price: -1, plan: 'x' })) === 'VMU_MONEY_NEGATIVE_FORBIDDEN',
    'D4: a negative price has its own named code')
}

// ---- E. minBids ------------------------------------------------------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.minBids': 2 } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x' })
  set(12000)
  a.close({ postId: p.postId })
  const e = err(() => a.award({ postId: p.postId, to: 'r-1', rationale: 'only bid' }))
  ok(e && e.code === 'VMU_STATE', 'E1: too few bids ⇒ the award is refused', e && e.code)
  ok(e && /现值=1/.test(String(e.hint || '')) && /下限=2/.test(String(e.hint || '')), 'E2: the refusal gives the current count and the floor', e && e.hint)
  ok(a.status().counters.awardsRefused === 1, 'E3: the refused award is counted')
}

// ---- F. duplicate bids must be visible -------------------------------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.minBids': 1 } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 30, plan: 'Step A\nStep B' })
  a.bid({ postId: p.postId, by: 'r-2', price: 30, plan: ' step b \n step a ' })
  set(12000)
  const closed = a.close({ postId: p.postId })
  ok(closed.collusion.length >= 2, 'F1: close() surfaces the collusion marks it found', JSON.stringify(closed.collusion.map((x) => x.kind)))
  const c = a.collusion({ postId: p.postId })
  const kinds = c.found.map((x) => x.kind)
  ok(kinds.includes('identical-price'), 'F2: an identical price is marked', JSON.stringify(kinds))
  ok(kinds.includes('identical-plan'), 'F3: an identical (normalised) plan is marked — normalisation makes "same plan" comparable', JSON.stringify(kinds))
  ok(normalizePlan('Step A\nStep B') === normalizePlan(' step b \n step a '), 'F4: normalizePlan is order/space/case insensitive')
  const st = a.status()
  ok(st.collusion.suspects.length >= 2 && st.collusion.marks >= 2, 'F5: the marks are VISIBLE in status() (never silent)', JSON.stringify(st.collusion.marks))
  ok(st.collusion.suspects.every((s) => s.code === 'VMU_COLLUSION_SUSPECTED'), 'F6: every mark carries the collusion code')
  ok(st.collusion.onSuspect === 'report', 'F7: the default action is REPORT (no auto-punishment)')
  const frozen = make({ settings: { 'vmu.collusion.onSuspect': 'freeze-review', 'vmu.auction.minBids': 1 } })
  const p2 = frozen.a.post({ taskId: 't-1', budget: 100 })
  frozen.a.bid({ postId: p2.postId, by: 'r-1', price: 30, plan: 'same' })
  frozen.a.bid({ postId: p2.postId, by: 'r-2', price: 30, plan: 'same' })
  frozen.set(12000)
  frozen.a.close({ postId: p2.postId })
  const e = err(() => frozen.a.award({ postId: p2.postId, to: 'r-1', rationale: 'pick' }))
  ok(e && e.code === 'VMU_COLLUSION_SUSPECTED', 'F8: freeze-review (opt-in) blocks the award with the collusion code', e && e.code)
}

// ---- G. caps and counted drops ---------------------------------------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.maxBids': 2, 'vmu.auction.maxOpenAuctions': 1, 'vmu.auction.minBids': 1 } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x' })
  a.bid({ postId: p.postId, by: 'r-2', price: 12, plan: 'y' })
  const third = err(() => a.bid({ postId: p.postId, by: 'r-3', price: 11, plan: 'z' }))
  ok(third && third.code === 'VMU_RESOURCE_BUDGET' && /\(2\/2\)/.test(String(third.message)), 'G1: the bid cap is a named refusal naming 现值/上限', third && third.message)
  const second = err(() => a.post({ taskId: 't-2', budget: 50 }))
  ok(second && second.code === 'VMU_RESOURCE_BUDGET' && /\(1\/1\)/.test(String(second.message)), 'G2: the open-auction cap is a named refusal naming 现值/上限', second && second.message)
  const st = a.status()
  ok(st.dropped.bids === 1 && st.dropped.total === 1, 'G3: the rejected bid is counted as a DROP', JSON.stringify(st.dropped))
  const small = make({ settings: { 'vmu.auction.maxPosts': 1, 'vmu.auction.maxOpenAuctions': 5 } })
  small.a.post({ taskId: 't-1', budget: 10 })
  ok(code(() => small.a.post({ taskId: 't-2', budget: 10 })) === 'VMU_RESOURCE_BUDGET', 'G4: the post cap refuses by name')
  ok(small.a.status().dropped.posts === 1, 'G5: the dropped post is counted (the open-auction cap is not what fires here)')
  set(12000)
  a.close({ postId: p.postId })
  ok(a.status().counters.closed === 1, 'G6: close is counted')
}

// ---- H. zero mechanism -----------------------------------------------------------------------------
{
  const a = createBidding({ clock: () => 1000 })
  const st = a.status()
  ok(st.configured === false && st.enabled === false, 'H1: the market is inert by default (auction.enabled=false)')
  ok(a.list().count === 0, 'H2: list() answers on an inert market (no crash)')
  ok(code(() => a.post({ taskId: 't', budget: 1, deadlineMs: 2000 })) === 'VMU_STATE', 'H3: posting on an inert market is a NAMED refusal')
  ok(a.status().counters.skips >= 1, 'H4: the inert skip is COUNTED')
  ok(st.closeRule === 'best-score' && st.minBids === 1 && st.maxBidCost === 0 && st.reputationInPrice === false,
    'H5: the documented defaults are reported', JSON.stringify({ r: st.closeRule, m: st.minBids, c: st.maxBidCost, rep: st.reputationInPrice }))
  ok(CLOSE_RULES.length === 3 && TIE_BREAKS.includes('earliest') && fingerprintOf('x').length === 8,
    'H6: the vocabularies and the fingerprint helper are exported')
}

// ---- I. determinism --------------------------------------------------------------------------------
{
  const run = (a) => {
    const p = a.post({ taskId: 't-1', budget: 100 })
    a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x' })
    a.bid({ postId: p.postId, by: 'r-2', price: 10, plan: 'x' })
    a.close({ postId: p.postId, at: 12000 })
    a.award({ postId: p.postId, to: 'r-1', rationale: 'tie broken deterministically', overrideRule: true })
    return JSON.stringify(a.status())
  }
  const one = make({ settings: { 'vmu.auction.closeRule': 'lowest-cost' } }); one.set(1000)
  const two = make({ settings: { 'vmu.auction.closeRule': 'lowest-cost' } }); two.set(1000)
  const s1 = run(one.a); const s2 = run(two.a)
  ok(s1 === s2, 'I1: two instances fed the same calls produce byte-identical status()')
  // the `random` rule is a deterministic hash, not Math.random
  const mk = () => { const m = make({ settings: { 'vmu.auction.closeRule': 'random', 'vmu.auction.minBids': 1 } }); return m }
  const A = mk(); const pA = A.a.post({ taskId: 't', budget: 10 })
  A.a.bid({ postId: pA.postId, by: 'r-1', price: 1, plan: 'x' }); A.a.bid({ postId: pA.postId, by: 'r-2', price: 2, plan: 'y' })
  A.set(12000); A.a.close({ postId: pA.postId })
  const B = mk(); const pB = B.a.post({ taskId: 't', budget: 10 })
  B.a.bid({ postId: pB.postId, by: 'r-1', price: 1, plan: 'x' }); B.a.bid({ postId: pB.postId, by: 'r-2', price: 2, plan: 'y' })
  B.set(12000); B.a.close({ postId: pB.postId })
  ok(A.a.candidates({ postId: pA.postId }).candidates[0].by === B.a.candidates({ postId: pB.postId }).candidates[0].by,
    'I2: the random rule picks the same bidder for the same post id (deterministic hash)')
}

// ---- J. read paths do not mutate -------------------------------------------------------------------
{
  const { a, set } = make()
  const p = a.post({ taskId: 't-1', budget: 100 })
  a.bid({ postId: p.postId, by: 'r-1', price: 10, plan: 'x' })
  set(12000)
  a.close({ postId: p.postId })
  const before = JSON.stringify(a.status())
  a.list(); a.candidates({ postId: p.postId }); a.collusion({ postId: p.postId }); a.status()
  ok(JSON.stringify(a.status()) === before, 'J1: list/candidates/collusion/status do not change recorded data')
  const snap = a.list()
  ok(snap.posts[0].bids === 1 && snap.posts[0].state === 'closed', 'J2: list() reflects state without mutating it')
}

// ---- K. the declared close rule is enforced --------------------------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.closeRule': 'lowest-cost', 'vmu.auction.minBids': 1 } })
  const p = a.post({ taskId: 't-1', budget: 100 })
  ok(p.closeRule === 'lowest-cost', 'K1: the post records the rule declared up front')
  a.bid({ postId: p.postId, by: 'r-1', price: 30, plan: 'x' })
  a.bid({ postId: p.postId, by: 'r-2', price: 10, plan: 'y' })
  set(12000)
  a.close({ postId: p.postId })
  const cand = a.candidates({ postId: p.postId })
  ok(cand.candidates[0].by === 'r-2', 'K2: lowest-cost ranks the cheapest bid first', JSON.stringify(cand.candidates.map((c) => c.by)))
  const e = err(() => a.award({ postId: p.postId, to: 'r-1', rationale: 'prefer r-1' }))
  ok(e && e.code === 'VMU_CONFLICT' && /picks r-2/.test(String(e.message)), 'K3: awarding against the declared rule is a NAMED conflict naming the rule pick', e && e.message)
  ok(a.award({ postId: p.postId, to: 'r-1', rationale: 'deliberate override', overrideRule: true }).override === true,
    'K4: an explicit override is recorded (never silent)')
  const scored = make({ settings: { 'vmu.auction.closeRule': 'best-score', 'vmu.auction.minBids': 1 } })
  const p2 = scored.a.post({ taskId: 't', budget: 10 })
  scored.a.bid({ postId: p2.postId, by: 'r-1', price: 5, plan: 'x' })
  scored.set(12000)
  scored.a.close({ postId: p2.postId })
  const e2 = err(() => scored.a.award({ postId: p2.postId, to: 'r-1', rationale: 'only bid' }))
  ok(e2 && e2.code === 'VMU_STATE' && /no scores/.test(String(e2.message)), 'K5: best-score with no scores is UNDECIDED — no silent fallback', e2 && e2.message)
  const roster = make({ members: { has: (id) => id === 'r-1' } })
  const p3 = roster.a.post({ taskId: 't', budget: 10 })
  ok(code(() => roster.a.bid({ postId: p3.postId, by: 'r-9', price: 1, plan: 'x' })) === 'VMU_NOT_MEMBER',
    'K6: a non-member bid is refused by name (roster seam)')
  const good = roster.a.bid({ postId: p3.postId, by: 'r-1', price: 1, plan: 'x' })
  ok(good.ok === true && good.revision === 1, 'K7: a member bid passes the roster seam')
  const rebid = roster.a.bid({ postId: p3.postId, by: 'r-1', price: 2, plan: 'x2' })
  ok(rebid.replaced === true && rebid.revision === 2 && roster.a.status().counters.rebids === 1,
    'K8: replacing a bid is recorded as a revision (not hidden)', JSON.stringify(rebid))
}

// ---- Z. cancel(): the cancellation rail (previously untested) ----------------------------------------
{
  const { a, set } = make({ settings: { 'vmu.auction.maxOpenAuctions': 10 } })   // cancelNeedsReason defaults to true
  const p1 = a.post({ taskId: 't-c1', budget: 100 })
  const p2 = a.post({ taskId: 't-c2', budget: 100 })
  a.bid({ postId: p1.postId, by: 'r-1', price: 10, plan: 'x' })
  a.bid({ postId: p2.postId, by: 'r-2', price: 20, plan: 'y' })
  set(1500)
  const c1 = a.cancel({ postId: p1.postId, by: 'office', reason: 'the task was withdrawn' })
  ok(c1.ok === true && c1.cancelled === true && c1.postId === p1.postId && c1.at === 1500,
    'Z1: an open auction can be cancelled (and the time is the injected one)', JSON.stringify(c1))
  ok(c1.reason === 'the task was withdrawn',
    'Z2: the cancellation LEAVES A TRACE (who/why/when: the reason is echoed)', JSON.stringify(c1))
  ok(a.status().counters.cancelled === 1, 'Z3: the cancellation is counted', JSON.stringify(a.status().counters))
  const eNoReason = err(() => a.cancel({ postId: p2.postId, by: 'office' }))
  ok(eNoReason && eNoReason.code === 'VMU_INVALID_ARGUMENT' && /reason/.test(String(eNoReason.message)),
    'Z4: cancelNeedsReason=true ⇒ a missing reason is a NAMED refusal', eNoReason && eNoReason.code)
  const eUnknown = err(() => a.cancel({ postId: 'nope', by: 'office', reason: 'x' }))
  ok(eUnknown && eUnknown.code === 'VMU_NO_SUCH_OBJECT', 'Z5: an unknown postId is a NAMED refusal', eUnknown && eUnknown.code)
  const eBadAt = err(() => a.cancel({ postId: p2.postId, by: 'office', reason: 'x', at: 'not-a-time' }))
  ok(eBadAt && eBadAt.code === 'VMU_INVALID_ARGUMENT', 'Z6: a malformed `at` is a NAMED refusal', eBadAt && eBadAt.code)
  const p3 = a.post({ taskId: 't-c3', budget: 100 })
  a.bid({ postId: p3.postId, by: 'r-3', price: 30, plan: 'z', score: 0.9 })   // best-score needs a numeric score
  set(12000)   // the window must be over before close() (or pass force:true)
  a.close({ postId: p3.postId })
  a.award({ postId: p3.postId, to: 'r-3', rationale: 'only bid' })
  const eAwarded = err(() => a.cancel({ postId: p3.postId, by: 'office', reason: 'late' }))
  ok(eAwarded && eAwarded.code === 'VMU_STATE' && /awarded/.test(String(eAwarded.message)),
    'Z7: an AWARDED auction cannot be cancelled (the STATE is named)', eAwarded && eAwarded.code)
  const eTwice = err(() => a.cancel({ postId: p1.postId, by: 'office', reason: 'again' }))
  ok(eTwice && eTwice.code === 'VMU_STATE' && /cancelled/.test(String(eTwice.message)),
    'Z8: cancelling twice is a NAMED refusal (already cancelled)', eTwice && eTwice.code)
  const c2 = a.cancel({ postId: p2.postId, by: 'office', reason: 'also withdrawn' })
  ok(c2.ok === true && a.status().counters.cancelled === 2,
    'Z9: cancelling one auction does NOT disturb the others (a second auction still cancels cleanly)',
    JSON.stringify(a.status().counters))
}

// ---- Z. ROUND 117: the fair-dispatch quota the volume declares, asserted BOTH ways -------------------
{
  // The bidding window is closed by advancing the clock; every scenario pins a short window so the advance is
  // deliberate and small, and the rotation window is wider than one step so Z6 stays inside it on purpose.
  const WIN = { 'vmu.auction.bidWindowMs': 100, 'vmu.auction.closeRule': 'lowest-cost' }
  const run = (s, taskId, by) => {
    const p = s.a.post({ taskId, budget: 100 })
    s.a.bid({ postId: p.postId, by, price: 10, plan: 'a' })
    s.set(s.at() + 200)
    s.a.close({ postId: p.postId })
    return p
  }

  // (a) NEGATIVE FIRST: under the default policy (`equal`) the quota must not bite at all.
  const d = make({ settings: Object.assign({}, WIN) })
  const p1 = run(d, 't-1', 'r-1')
  ok(d.a.award({ postId: p1.postId, to: 'r-1', rationale: 'first' }).ok === true, 'Z1: under the default equal policy the first award goes through')
  const p2 = run(d, 't-2', 'r-1')
  ok(code(() => d.a.award({ postId: p2.postId, to: 'r-1', rationale: 'again' })) !== 'VMU_FAIRNESS_QUOTA',
    'Z2: and a SECOND award to the same member is NOT refused under `equal` (the guard must not fire by default)')

  // (b) the quota policy refuses by name, and the refusal says the share and the knob
  const q = make({ settings: Object.assign({}, WIN, { 'vmu.auction.fairnessPolicy': 'quota', 'vmu.auction.dirtyWorkQuota': 0.5 }) })
  const q1 = run(q, 't-1', 'r-1')
  ok(q.a.award({ postId: q1.postId, to: 'r-1', rationale: 'first' }).ok === true, 'Z3: the first award fits the quota')
  const q2 = run(q, 't-2', 'r-1')
  const refusal = err(() => q.a.award({ postId: q2.postId, to: 'r-1', rationale: 'again' }))
  ok(refusal && refusal.code === 'VMU_FAIRNESS_QUOTA',
    'Z4: under `quota` a second award to one member is REFUSED by the registered code', refusal && refusal.code)
  ok(refusal && /2\/2/.test(String(refusal.message)) && /dirtyWorkQuota=0\.5/.test(String(refusal.message)),
    'Z5: and the refusal names the share it would create and the knob that decided', refusal && refusal.message)

  // (c) the rotation window narrows which past awards count, so the same award becomes admissible again
  const w = make({ settings: Object.assign({}, WIN, { 'vmu.auction.fairnessPolicy': 'quota', 'vmu.auction.dirtyWorkQuota': 0.5, 'vmu.auction.rotationWindow': 10000 }) })
  const w1 = run(w, 't-1', 'r-1')
  w.a.award({ postId: w1.postId, to: 'r-1', rationale: 'first' })
  const w2 = run(w, 't-2', 'r-1')
  ok(code(() => w.a.award({ postId: w2.postId, to: 'r-1', rationale: 'again' })) === 'VMU_FAIRNESS_QUOTA',
    'Z6: inside the rotation window the second award is still refused')
  w.set(w.at() + 99999)
  const w3 = run(w, 't-3', 'r-1')
  ok(code(() => w.a.award({ postId: w3.postId, to: 'r-1', rationale: 'third' })) !== 'VMU_FAIRNESS_QUOTA',
    'Z7: once the earlier award falls outside the window it no longer counts, so the award is allowed (the window has a real effect)')
}

if (failed === 0) {
  console.log('=== VMU BIDDING: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU BIDDING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
