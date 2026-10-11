// vmu kernel · bidding — the MARKET mechanism: post a task, collect bids, close, award
// (docs/17-agent-society-and-delegation.md §10 任务竞标与分配, §17 公平与防串谋, §20.5/§20.3 键表).
//
// Design source: docs/17
//   §10 auction/bid/claim/assignment: the close rule is DECLARED UP FRONT (lowest-cost | best-score |
//       random); reputation must never seat a winner directly (S-3); bids are audited; low-balling is
//       countered by the post-mortem discipline (§13), not by a hidden score.
//   §17 anti-collusion: `kernel.collusion.scan` reports, it does NOT auto-punish (`onSuspect` default
//       `report`); the criteria are public and recomputable; false positives can be appealed (§5).
//   §20.5 keys (`vmu.auction.*`) and §20.3 keys (`vmu.collusion.*`, `vmu.trust.*`) — read TOLERANTLY here
//       (absent ⇒ the documented default), so this module is usable without the registry rows landing first.
//   §27 交界: the TASK BOARD and the BUDGET belong to 08 — this module takes a `taskId` and a budget and
//       REFERENCES them; it never redefines task state or resource accounting.
//
// HARD INVARIANTS (the task's six, plus the kernel's usual rails)
//   ① NO BID AFTER THE DEADLINE — a named refusal (`VMU_AUCTION_CLOSED`) that CARRIES the deadline;
//   ② AN AWARD NEEDS A RATIONALE — `vmu.auction.awardNeedsRationale` (default true) ⇒ a nameless award is
//      refused with a hint that names the key;
//   ③ REPUTATION MUST NOT PRICE A BID — with `vmu.auction.reputationInPrice=false` (default) a bid that
//      carries a reputation weight/adjusted price is refused BY NAME (`VMU_TRUST_USE_FORBIDDEN`); trust may
//      only ORDER candidates (`vmu.trust.useInAuction`), never move a price;
//   ④ priceCap (`vmu.auction.maxBidCost`, 0 = unlimited) CANNOT BE EXCEEDED — refusal carries 现值/上限;
//   ⑤ AN AWARD NEEDS `minBids` — fewer bids ⇒ refusal carrying the CURRENT count and the minimum;
//   ⑥ DUPLICATE BIDS MUST BE VISIBLE — the collusion scan marks identical prices / identical plans /
//      mutual-affinity pairs and the marks go into `status()`; silence here would hide围标 ✗.
//   · every upper bound (posts/bids/open auctions) reports its DROPPED count — never silent;
//   · the only time source is the injected `clock`; `random` is a deterministic hash of the post id (no
//     Math.random anywhere) ⇒ two runs over the same calls produce byte-identical status();
//   · READ paths (list/candidates/collusion/status) never mutate recorded data;
//   · ZERO MECHANISM: `vmu.auction.enabled` defaults to FALSE ⇒ nothing can be posted, `list()`/`status()`
//     still answer, and every attempt is a NAMED refusal — never a crash.
//
// Codes used here (all registered in 03-§8 — this module deliberately invents NONE):
//   VMU_STATE (auction disabled / close-time / not-yet-closed / insufficient bids) ·
//   VMU_AUCTION_CLOSED (bid after the deadline) · VMU_AUCTION_INVALID_BID (malformed / over the cap) ·
//   VMU_AUCTION_LIMIT · VMU_MONEY_NEGATIVE_FORBIDDEN · VMU_COLLUSION_SUSPECTED ·
//   VMU_TRUST_USE_FORBIDDEN · VMU_RESOURCE_BUDGET · VMU_NOT_MEMBER · VMU_NO_SUCH_OBJECT ·
//   VMU_CONFLICT · VMU_INVALID_ARGUMENT · VMU_NOT_PERMITTED
// The delivery report proposes two ADDITIONAL names (VMU_AWARD_RATIONALE_REQUIRED, VMU_AUCTION_MIN_BIDS)
// for the two rails above; they are NOT raised here so the docs audit stays green until they are registered.

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The declared close rules (docs/17 §10: the rule is written up front). */
export const CLOSE_RULES = Object.freeze(['lowest-cost', 'best-score', 'random'])

/** Deterministic tie-breaks, applied in order when the rule leaves more than one candidate. */
export const TIE_BREAKS = Object.freeze(['earliest', 'price', 'id'])

/** ROUND 116: the fair-dispatch strategies docs/17 §S09 declares (`equal｜quota｜rotation`). */
export const FAIRNESS_POLICIES = Object.freeze(['equal', 'quota', 'rotation'])

const DEFAULTS = Object.freeze({
  bidWindowMs: 0, maxBidCost: 0, maxOpenAuctions: 1, maxBids: 50, maxPosts: 100, maxSuspects: 200,
  minBids: 1, awardNeedsRationale: true, cancelNeedsReason: true, collusionScan: true,
  reputationInPrice: false, tieBreak: 'earliest', closeRule: 'best-score', requirePlan: true,
  collusionWindowMs: 0, collusionMaxMutualShare: 0.8, collusionMinEvidence: 2, collusionOnSuspect: 'report',
  fairnessPolicy: 'equal', dirtyWorkQuota: 0, rotationWindow: 0,
})

/** A deterministic, dependency-free fingerprint (djb2 hex) — used for plan identity and `random`. */
export function fingerprintOf(text) {
  let h = 5381
  const s = String(text)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Normalise a plan so "the same plan" is comparable: trim, lowercase, collapse whitespace, sort lines. */
export function normalizePlan(plan) {
  if (plan === null || plan === undefined) return ''
  const raw = typeof plan === 'string' ? plan : JSON.stringify(plan)
  return raw.trim().toLowerCase().split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).sort().join('\n')
}

/**
 * createBidding — the market surface. Every dependency except `clock` is OPTIONAL:
 * `members` (a roster seam: `{has(id)| roster()}`) and `trust` (a reputation seam) are used ONLY where
 * documented; `log`/`bus` are advisory and never break a call.
 */
export function createBidding({ clock = () => 0, log = null, settings = {}, bus = null, members = null, trust = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createBidding needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging never breaks a bid */ } } }
  const emit = (event) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(event) } catch (e) { /* the bus is advisory */ } } }
  const asInt = (v, def, min = 0) => (Number.isInteger(v) && v >= min ? v : def)
  const asNum = (v, def, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : def)
  const atMs = (at) => (at === null || at === undefined ? clock()
    : (typeof at === 'number' && Number.isFinite(at) ? at
      : (typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : null)))
  const r6 = (n) => Number(Number(n).toFixed(6))

  const enabled = sget('vmu.auction.enabled', false) === true
  const claimFirst = sget('vmu.auction.claimFirst', true) === true
  const closeRuleSetting = (() => { const v = sget('vmu.auction.closeRule', DEFAULTS.closeRule); return CLOSE_RULES.includes(v) ? v : DEFAULTS.closeRule })()
  const bidWindowMs = asInt(sget('vmu.auction.bidWindowMs', DEFAULTS.bidWindowMs), DEFAULTS.bidWindowMs)
  const maxBidCost = asNum(sget('vmu.auction.maxBidCost', DEFAULTS.maxBidCost), DEFAULTS.maxBidCost)
  const requirePlan = sget('vmu.auction.requirePlan', DEFAULTS.requirePlan) === true
  const maxOpenAuctions = asInt(sget('vmu.auction.maxOpenAuctions', DEFAULTS.maxOpenAuctions), DEFAULTS.maxOpenAuctions)
  const minBids = asInt(sget('vmu.auction.minBids', DEFAULTS.minBids), DEFAULTS.minBids)
  const maxBids = asInt(sget('vmu.auction.maxBids', DEFAULTS.maxBids), DEFAULTS.maxBids, 1)
  const maxPosts = asInt(sget('vmu.auction.maxPosts', DEFAULTS.maxPosts), DEFAULTS.maxPosts, 1)
  const awardNeedsRationale = sget('vmu.auction.awardNeedsRationale', DEFAULTS.awardNeedsRationale) === true
  const cancelNeedsReason = sget('vmu.auction.cancelNeedsReason', DEFAULTS.cancelNeedsReason) === true
  const collusionScanOn = sget('vmu.auction.collusionScan', DEFAULTS.collusionScan) === true
  const reputationInPrice = sget('vmu.auction.reputationInPrice', DEFAULTS.reputationInPrice) === true
  const tieBreak = (() => { const v = sget('vmu.auction.tieBreak', DEFAULTS.tieBreak); return TIE_BREAKS.includes(v) ? v : DEFAULTS.tieBreak })()
  const trustUseInAuction = sget('vmu.trust.useInAuction', true) === true
  const collusionWindowMs = asInt(sget('vmu.collusion.windowMs', DEFAULTS.collusionWindowMs), DEFAULTS.collusionWindowMs)
  const collusionMaxMutualShare = asNum(sget('vmu.collusion.maxMutualShare', DEFAULTS.collusionMaxMutualShare), DEFAULTS.collusionMaxMutualShare)
  const collusionMinEvidence = asInt(sget('vmu.collusion.minEvidence', DEFAULTS.collusionMinEvidence), DEFAULTS.collusionMinEvidence, 1)
  const collusionOnSuspect = sget('vmu.collusion.onSuspect', DEFAULTS.collusionOnSuspect) === 'freeze-review' ? 'freeze-review' : 'report'
  const maxSuspects = asInt(sget('vmu.auction.maxSuspects', DEFAULTS.maxSuspects), DEFAULTS.maxSuspects, 1)
  // ROUND 116 (docs/17 §S09, anti-cherry-picking): the three keys the volume declares for fair dispatch. They were
  // planned while the registry already carried `VMU_FAIRNESS_QUOTA` as a registered code - a code the module never
  // threw. `equal` is the default, so nothing below changes behaviour unless a pack asks for `quota`.
  const fairnessPolicy = FAIRNESS_POLICIES.includes(sget('vmu.auction.fairnessPolicy', DEFAULTS.fairnessPolicy))
    ? sget('vmu.auction.fairnessPolicy', DEFAULTS.fairnessPolicy) : DEFAULTS.fairnessPolicy
  const dirtyWorkQuota = asNum(sget('vmu.auction.dirtyWorkQuota', DEFAULTS.dirtyWorkQuota), DEFAULTS.dirtyWorkQuota)
  const rotationWindow = asInt(sget('vmu.auction.rotationWindow', DEFAULTS.rotationWindow), DEFAULTS.rotationWindow)

  // ── state (mutated only by post/bid/close/award/cancel) ────────────────────────────────────────────
  const posts = new Map()            // postId -> post
  const order = []                   // postIds in creation order
  const postDropped = { n: 0 }
  const suspects = []                // collusion marks (visible in status(); capped + drops counted)
  const suspectDropped = { n: 0 }
  const counters = { posted: 0, bids: 0, rebids: 0, bidDropped: 0, closed: 0, awarded: 0, cancelled: 0, scans: 0, skips: 0, awardsRefused: 0 }
  const refusalCounts = new Map()

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)

  /** Named refusal: COUNTED BY CODE before it is thrown (docs/21 §4.3 #1 rail reused here). */
  const deny = (code, message, hint) => {
    bump(refusalCounts, code, 1)
    say({ type: 'bidding/refused', at: clock(), code, message })
    return refuse(code, message, hint)
  }

  const openPosts = () => order.filter((id) => posts.get(id).state === 'open')
  const postOf = (id) => posts.get(String(id))
  const bidList = (post) => post.bidOrder.map((by) => post.bids.get(by))
  const isMember = (by) => {
    if (typeof by !== 'string' || !by) return false
    if (!members) return true
    try {
      if (typeof members.has === 'function') return members.has(by) === true
      if (typeof members.roster === 'function') return (members.roster() || []).some((m) => (m && (m.id === by || m === by)))
    } catch (e) { return true }   // a broken roster seam must not break the market
    return true
  }
  /** The declared winner under the configured close rule (deterministic; ties resolved by `tieBreak`). */
  const rankBids = (post) => {
    const bids = bidList(post)
    const tie = (a, b) => {
      if (tieBreak === 'price') return a.price - b.price || (a.by < b.by ? -1 : 1)
      if (tieBreak === 'id') return a.by < b.by ? -1 : 1
      return a.at - b.at || (a.by < b.by ? -1 : 1)
    }
    if (closeRuleSetting === 'lowest-cost') return bids.slice().sort((a, b) => a.price - b.price || tie(a, b))
    if (closeRuleSetting === 'best-score') {
      const scored = bids.filter((b) => typeof b.score === 'number' && Number.isFinite(b.score))
      if (scored.length === 0 && bids.length > 0) return []
      return scored.slice().sort((a, b) => b.score - a.score || tie(a, b))
    }
    // random — DETERMINISTIC: sorted by bidder id, index = fingerprint(postId) % n (never Math.random)
    const sorted = bids.slice().sort((a, b) => (a.by < b.by ? -1 : 1))
    if (sorted.length === 0) return []
    const idx = parseInt(fingerprintOf(post.id), 16) % sorted.length
    return [sorted[idx]].concat(sorted.filter((b) => b !== sorted[idx]))
  }
  const scanFor = (post) => {
    const out = []
    const bids = bidList(post)
    // ① identical price (a NORMALISED comparison: money, not text)
    const byPrice = new Map()
    for (const b of bids) { const k = String(r6(b.price)); byPrice.set(k, (byPrice.get(k) || []).concat(b.by)) }
    for (const [price, bys] of [...byPrice.entries()].sort()) {
      if (bys.length >= 2) out.push({ kind: 'identical-price', post: post.id, price: Number(price), members: bys.slice().sort(), evidence: bys.length, share: 1, note: 'two or more bids named the same price' })
    }
    // ② identical plan (normalised text, hashed)
    const byPlan = new Map()
    for (const b of bids) {
      if (!b.planNorm) continue
      const k = fingerprintOf(b.planNorm)
      byPlan.set(k, (byPlan.get(k) || []).concat(b.by))
    }
    for (const [fp, bys] of [...byPlan.entries()].sort()) {
      if (bys.length >= 2) out.push({ kind: 'identical-plan', post: post.id, planFingerprint: fp, members: bys.slice().sort(), evidence: bys.length, share: 1, note: 'two or more bids carried the same normalised plan' })
    }
    return out
  }
  /** Cross-post mutual affinity: pairs that co-bid on ≥ minEvidence posts inside the window. */
  const scanAffinity = (at) => {
    const out = []
    const perBidder = new Map()
    for (const id of order) {
      const p = posts.get(id)
      for (const by of p.bidOrder) {
        if (!perBidder.has(by)) perBidder.set(by, [])
        perBidder.get(by).push({ post: id, at: p.bids.get(by).at })
      }
    }
    const bidders = [...perBidder.keys()].sort()
    for (let i = 0; i < bidders.length; i++) {
      for (let j = i + 1; j < bidders.length; j++) {
        const a = perBidder.get(bidders[i]); const b = perBidder.get(bidders[j])
        const inWindow = (r) => collusionWindowMs <= 0 || Math.abs(at - r.at) <= collusionWindowMs
        const shared = a.filter((x) => inWindow(x) && b.some((y) => y.post === x.post))
        if (shared.length < collusionMinEvidence) continue
        const share = shared.length / Math.max(1, Math.min(a.length, b.length))
        if (share >= collusionMaxMutualShare) {
          out.push({ kind: 'mutual-affinity', post: null, members: [bidders[i], bidders[j]].sort(), sharedPosts: shared.map((x) => x.post).sort(), evidence: shared.length, share: r6(share), note: 'a bidder pair co-bids on the same posts within the scan window' })
        }
      }
    }
    return out
  }
  const rememberSuspects = (found, at) => {
    for (const s of found) {
      if (suspects.length >= maxSuspects) { suspectDropped.n += 1; continue }
      suspects.push(Object.assign({ at, code: 'VMU_COLLUSION_SUSPECTED' }, s))
      say({ type: 'bidding/collusion-suspected', at, code: 'VMU_COLLUSION_SUSPECTED', suspect: s })
      emit({ type: 'bidding/collusion-suspected', at, suspect: s })
      if (collusionOnSuspect === 'freeze-review' && s.post) posts.get(s.post).reviewFrozen = true
    }
    return found
  }

  const api = {
    apiVersion,
    CLOSE_RULES, TIE_BREAKS, fingerprintOf, normalizePlan,

    /** Post a task for bidding. `deadlineMs` is absolute; when omitted the configured window is used. */
    post({ taskId, requirements = null, budget, deadlineMs = null, id = null, at = null } = {}) {
      if (!enabled) {
        counters.skips += 1
        throw deny('VMU_STATE', 'vmu.auction.enabled is false: the market is inert (zero mechanism)', 'set vmu.auction.enabled=true to open auctions (docs/17 §20.5)')
      }
      if (typeof taskId !== 'string' || !taskId) throw deny('VMU_INVALID_ARGUMENT', 'post needs a taskId (the 08 task board owns the task itself)', 'e.g. { taskId: "t-1", budget: 100, deadlineMs: now + 60000 }')
      if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) throw deny('VMU_INVALID_ARGUMENT', 'post needs a positive finite budget', 'the budget belongs to 08; this module only references it (docs/17 §27)')
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'post `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const deadline = deadlineMs === null
        ? (bidWindowMs > 0 ? ms + bidWindowMs : null)
        : (typeof deadlineMs === 'number' && Number.isFinite(deadlineMs) ? deadlineMs : null)
      if (deadline === null) throw deny('VMU_INVALID_ARGUMENT', 'post needs a deadline: give deadlineMs or set vmu.auction.bidWindowMs', 'a deadline is what makes "no bid after the deadline" decidable (docs/17 §10)')
      if (deadline <= ms) throw deny('VMU_INVALID_ARGUMENT', 'the deadline must be in the future: ' + deadline + ' (now ' + ms + ')', 'give deadlineMs > now, or a positive vmu.auction.bidWindowMs')
      if (openPosts().length >= maxOpenAuctions) {
        throw deny('VMU_RESOURCE_BUDGET', 'open auctions at the cap (' + openPosts().length + '/' + maxOpenAuctions + '): ' + taskId,
          'close or cancel an open auction, or raise vmu.auction.maxOpenAuctions (docs/17 §10: 现值/上限)')
      }
      if (posts.size >= maxPosts) {
        postDropped.n += 1
        say({ type: 'bidding/dropped', at: ms, what: 'post', cap: maxPosts })
        throw deny('VMU_RESOURCE_BUDGET', 'post cap reached (' + posts.size + '/' + maxPosts + ')',
          'raise vmu.auction.maxPosts; every dropped post is counted, never silent')
      }
      const postId = String(id === null ? 'p' + (counters.posted + 1) : id)
      if (posts.has(postId)) throw deny('VMU_CONFLICT', 'post id already exists: ' + postId, 'ids are never reused — history stays addressable')
      const post = {
        id: postId, taskId, requirements: requirements && typeof requirements === 'object' ? Object.assign({}, requirements) : requirements,
        budget: r6(budget), deadlineMs: deadline, postedAt: ms, state: 'open', closeRule: closeRuleSetting,
        bids: new Map(), bidOrder: [], awarded: null, cancelled: null, reviewFrozen: false, revisions: 0,
      }
      posts.set(postId, post); order.push(postId); counters.posted += 1
      say({ type: 'bidding/posted', at: ms, post: postId, taskId, budget: post.budget, deadlineMs: deadline, closeRule: post.closeRule })
      return { ok: true, posted: true, postId, post: Object.assign({}, post, { bids: undefined, bidOrder: undefined }), closeRule: post.closeRule, claimFirst }
    },

    /**
     * Place (or replace) a bid. INVARIANT ①: after the deadline this is a NAMED refusal carrying the
     * deadline. INVARIANT ③: a reputation weight on the PRICE is refused by name unless the operator has
     * explicitly enabled `vmu.auction.reputationInPrice`.
     */
    bid({ postId, by, price, plan = null, score = null, cost = null, reputationWeight = null, adjustedPrice = null, at = null } = {}) {
      if (!enabled) { counters.skips += 1; throw deny('VMU_STATE', 'vmu.auction.enabled is false: the market is inert (zero mechanism)', 'set vmu.auction.enabled=true to bid') }
      const post = postOf(postId)
      if (!post) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'open: ' + (order.filter((i) => posts.get(i).state === 'open').join(', ') || 'none'))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'bid `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (typeof by !== 'string' || !by) throw deny('VMU_INVALID_ARGUMENT', 'bid needs a non-empty bidder id', 'e.g. { postId, by: "r-1", price: 10, plan: "…" }')
      if (!isMember(by)) throw deny('VMU_NOT_MEMBER', 'bidder is not a member of this instance: ' + by, 'hire/assign the member first (08 task board roster), or fix the roster seam')
      if (post.state !== 'open') throw deny('VMU_AUCTION_CLOSED', 'auction is not open (state: ' + post.state + ')', 'the auction closed at ' + post.deadlineMs + ' (docs/17 §10: 结标时间)')
      // ① THE DEADLINE RAIL (the deadline is always carried in the refusal)
      if (ms >= post.deadlineMs) {
        throw deny('VMU_AUCTION_CLOSED', 'the bidding window closed at ' + post.deadlineMs + ' (bid at ' + ms + ')',
          'deadline=' + post.deadlineMs + ', post=' + post.id + ' — the deadline is fixed by the post, not by the bidder')
      }
      if (typeof price !== 'number' || !Number.isFinite(price)) throw deny('VMU_AUCTION_INVALID_BID', 'bid needs a finite numeric price for ' + by, 'price was: ' + String(price))
      if (price < 0) throw deny('VMU_MONEY_NEGATIVE_FORBIDDEN', 'a bid price cannot be negative: ' + price, 'money is non-negative; a zero bid is allowed, a negative one is not')
      // ④ THE PRICE CAP RAIL
      if (maxBidCost > 0 && price > maxBidCost) {
        throw deny('VMU_AUCTION_INVALID_BID', 'bid exceeds vmu.auction.maxBidCost: ' + r6(price) + ' > ' + maxBidCost,
          '现值=' + r6(price) + ', 上限=' + maxBidCost + ' (the cap cannot be exceeded; docs/17 §10)')
      }
      // ③ THE REPUTATION-IN-PRICE RAIL
      if (!reputationInPrice && (reputationWeight !== null || adjustedPrice !== null)) {
        throw deny('VMU_TRUST_USE_FORBIDDEN', 'reputation must not price a bid (vmu.auction.reputationInPrice=false): ' + by,
          'pass no reputationWeight/adjustedPrice; reputation may ORDER candidates (vmu.trust.useInAuction) but never move a price (docs/17 §10 S-3)')
      }
      if (requirePlan && !normalizePlan(plan)) {
        throw deny('VMU_AUCTION_INVALID_BID', 'bid needs a plan (vmu.auction.requirePlan=true): ' + by,
          'a bid states cost, time and risk — give plan as text or an object')
      }
      const existing = post.bids.get(by)
      if (!existing && post.bidOrder.length >= maxBids) {
        counters.bidDropped += 1
        say({ type: 'bidding/dropped', at: ms, what: 'bid', post: post.id, cap: maxBids })
        throw deny('VMU_RESOURCE_BUDGET', 'bid cap reached for this auction (' + post.bidOrder.length + '/' + maxBids + '): ' + by,
          'raise vmu.auction.maxBids; the dropped bid is COUNTED (现值/上限)')
      }
      const entry = {
        by, price: r6(price), plan: plan === null ? null : plan, planNorm: normalizePlan(plan),
        planFingerprint: fingerprintOf(normalizePlan(plan)), score: typeof score === 'number' && Number.isFinite(score) ? score : null,
        cost: cost && typeof cost === 'object' ? Object.assign({}, cost) : cost,
        reputationWeight: reputationInPrice && typeof reputationWeight === 'number' ? reputationWeight : null,
        adjustedPrice: reputationInPrice && typeof adjustedPrice === 'number' ? adjustedPrice : null,
        at: ms, revision: (existing ? existing.revision + 1 : 1),
      }
      if (!existing) post.bidOrder.push(by)
      else { post.revisions += 1; counters.rebids += 1 }
      post.bids.set(by, entry)
      counters.bids += 1
      say({ type: 'bidding/bid', at: ms, post: post.id, by, price: entry.price, planFingerprint: entry.planFingerprint, revision: entry.revision })
      return { ok: true, bid: true, postId: post.id, by, price: entry.price, revision: entry.revision, replaced: !!existing, reputationInPrice }
    },

    /** Close the auction (earliest at the deadline, or later). Closing twice is a named refusal. */
    close({ postId, at = null, force = false } = {}) {
      const post = postOf(postId)
      if (!post) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'open: ' + (order.filter((i) => posts.get(i).state === 'open').join(', ') || 'none'))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'close `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (post.state !== 'open') throw deny('VMU_STATE', 'auction is already ' + post.state + ': ' + post.id, 'a closed auction is never reopened; open a new post instead')
      if (!force && ms < post.deadlineMs) throw deny('VMU_STATE', 'the bidding window is still open until ' + post.deadlineMs + ' (' + (post.deadlineMs - ms) + 'ms left)', 'wait for the deadline, or pass force:true to close early (it is recorded)')
      post.state = 'closed'; post.closedAt = ms; post.closedEarly = ms < post.deadlineMs
      counters.closed += 1
      const collusion = collusionScanOn ? rememberSuspects(scanFor(post), ms) : []
      say({ type: 'bidding/closed', at: ms, post: post.id, bids: post.bidOrder.length, early: post.closedEarly, suspects: collusion.length })
      return { ok: true, closed: true, postId: post.id, closedAt: ms, early: post.closedEarly, bids: post.bidOrder.length, collusion }
    },

    /**
     * Award the task. INVARIANT ② (rationale), ⑤ (minBids) and the declared-rule rail: awarding a bidder
     * the rule did not pick is a NAMED conflict unless `vmu.auction.allowRuleOverride` is set.
     */
    award({ postId, to, rationale = null, at = null, overrideRule = null } = {}) {
      const post = postOf(postId)
      if (!post) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'open: ' + (order.filter((i) => posts.get(i).state === 'open').join(', ') || 'none'))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'award `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (post.state === 'cancelled') throw deny('VMU_STATE', 'the auction was cancelled: ' + post.id, 'a cancelled auction cannot be awarded')
      if (post.awarded) throw deny('VMU_STATE', 'the auction is already awarded to ' + post.awarded.to, 'an award is final here; a re-award needs a new post (docs/17 §10)')
      if (post.state !== 'closed') throw deny('VMU_STATE', 'the auction is not closed yet (state: ' + post.state + ', deadline ' + post.deadlineMs + ')', 'close() first: awarding before the deadline would ignore late bids (docs/17 §10)')
      if (post.reviewFrozen) {
        counters.awardsRefused += 1
        throw deny('VMU_COLLUSION_SUSPECTED', 'award is frozen for review (vmu.collusion.onSuspect=freeze-review): ' + post.id,
          'review the collusion marks in status().collusion.suspects and clear the freeze explicitly')
      }
      if (awardNeedsRationale && !(typeof rationale === 'string' && rationale.trim())) {
        counters.awardsRefused += 1
        throw deny('VMU_INVALID_ARGUMENT', 'an award must carry a rationale (vmu.auction.awardNeedsRationale=true): ' + post.id,
          'give rationale as non-empty text: vmu.auction.awardNeedsRationale=true makes the reason mandatory (docs/17 §10) — the reason is what makes the award auditable')
      }
      // ROUND 116: fair dispatch (docs/17 S09, anti-cherry-picking). Only the `quota` policy constrains
      // anything and `equal` is the default, so this cannot change behaviour unless a pack asks for it. The
      // share counts the awards this face has made - within `rotationWindow` when one is set - and the refusal
      // is the code the volume already registered and the module never threw: VMU_FAIRNESS_QUOTA.
      if (fairnessPolicy === 'quota' && dirtyWorkQuota > 0) {
        let mine = 0
        let total = 0
        for (const p of posts.values()) {
          if (!p.awarded) continue
          if (rotationWindow > 0 && ms - p.awarded.at > rotationWindow) continue
          total += 1
          if (String(p.awarded.to) === String(to)) mine += 1
        }
        if (total > 0 && (mine + 1) / (total + 1) > dirtyWorkQuota) {
          counters.awardsRefused += 1
          throw deny('VMU_FAIRNESS_QUOTA',
            'awarding to ' + String(to) + ' would put ' + (mine + 1) + '/' + (total + 1) + ' of the dirty work on one member, above vmu.auction.dirtyWorkQuota=' + dirtyWorkQuota,
            'pick another member, or raise vmu.auction.dirtyWorkQuota (docs/17 S09: the quota is what stops cherry-picking)')
        }
      }
      const bids = post.bidOrder.length
      if (bids < minBids) {
        counters.awardsRefused += 1
        throw deny('VMU_STATE', 'not enough bids to award: ' + bids + ' < minBids ' + minBids + ' (post ' + post.id + ')',
          '现值=' + bids + ', 下限=' + minBids + ' (vmu.auction.minBids) — extend the window or cancel the auction')
      }
      if (typeof to !== 'string' || !post.bids.has(to)) {
        counters.awardsRefused += 1
        throw deny('VMU_NO_SUCH_OBJECT', 'no bid from ' + String(to) + ' on ' + post.id, 'bidders: ' + (post.bidOrder.slice().sort().join(', ') || 'none'))
      }
      const ranked = rankBids(post)
      const expected = ranked.length ? ranked[0].by : null
      const override = overrideRule === true || sget('vmu.auction.allowRuleOverride', false) === true
      if (!override && expected !== null && to !== expected) {
        counters.awardsRefused += 1
        throw deny('VMU_CONFLICT', 'the close rule (' + post.closeRule + ') picks ' + expected + ', not ' + to,
          'the rule was declared up front (docs/17 §10); pass overrideRule:true to record a deliberate override, or fix the rule before posting')
      }
      if (expected === null && post.closeRule === 'best-score') {
        counters.awardsRefused += 1
        throw deny('VMU_STATE', 'closeRule best-score has no scores to rank (post ' + post.id + ')',
          'no bid carried a numeric score: record scores, or post with vmu.auction.closeRule=lowest-cost (no silent fallback)')
      }
      post.awarded = { to, at: ms, rationale: rationale === null ? null : String(rationale), rule: post.closeRule, expected, override: !!override, bids }
      post.state = 'awarded'
      counters.awarded += 1
      say({ type: 'bidding/awarded', at: ms, post: post.id, to, rule: post.closeRule, override: !!override, rationale: post.awarded.rationale })
      return { ok: true, awarded: true, postId: post.id, to, rule: post.closeRule, expected, override: !!override, bids, rationale: post.awarded.rationale, at: ms }
    },

    /** Cancel an open auction (reason required unless `vmu.auction.cancelNeedsReason=false`). */
    cancel({ postId, by = null, reason = null, at = null } = {}) {
      const post = postOf(postId)
      if (!post) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'open: ' + (order.filter((i) => posts.get(i).state === 'open').join(', ') || 'none'))
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'cancel `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      if (cancelNeedsReason && !(typeof reason === 'string' && reason.trim())) {
        throw deny('VMU_INVALID_ARGUMENT', 'cancel needs a reason (vmu.auction.cancelNeedsReason=true): ' + post.id,
          'an unexplained cancellation is indistinguishable from an accident')
      }
      if (post.state === 'awarded') throw deny('VMU_STATE', 'the auction is already awarded to ' + post.awarded.to, 'an awarded task is not cancelled here; open a follow-up post')
      if (post.state === 'cancelled') throw deny('VMU_STATE', 'the auction is already cancelled: ' + post.id, 'cancellation is recorded once')
      post.state = 'cancelled'; post.cancelled = { by, at: ms, reason: reason === null ? null : String(reason) }
      counters.cancelled += 1
      say({ type: 'bidding/cancelled', at: ms, post: post.id, by, reason: post.cancelled.reason })
      return { ok: true, cancelled: true, postId: post.id, at: ms, reason: post.cancelled.reason }
    },

    /** READ-ONLY: the ranked candidates under the declared rule (trust may ORDER, never price). */
    candidates({ postId } = {}) {
      const post = postOf(postId)
      if (!post) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'open: ' + (order.map((i) => posts.get(i).id).join(', ') || 'none'))
      const ranked = rankBids(post)
      let reputationUsed = false
      const rows = ranked.map((b, i) => {
        let trustScore = null
        if (trustUseInAuction && trust && typeof trust.score === 'function') {
          try { trustScore = trust.score(b.by); reputationUsed = reputationUsed || trustScore !== null } catch (e) { trustScore = null }
        }
        return { rank: i + 1, by: b.by, price: b.price, score: b.score, at: b.at, planFingerprint: b.planFingerprint, trustScore }
      })
      return {
        ok: true, postId: post.id, closeRule: post.closeRule, tieBreak, count: rows.length, candidates: rows,
        undecidable: rows.length === 0 && post.bidOrder.length > 0 && post.closeRule === 'best-score',
        reputation: { used: reputationUsed, role: 'selection-only', inPrice: reputationInPrice },
        note: 'reputation may ORDER candidates (vmu.trust.useInAuction) but never changes a price (vmu.auction.reputationInPrice=false by default)',
        at: clock(),
      }
    },

    /** READ-ONLY: the collusion scan (docs/17 §17) — public criteria, recomputable, no auto-punishment. */
    collusion({ postId = null, at = null } = {}) {
      const ms = atMs(at)
      if (ms === null) throw deny('VMU_INVALID_ARGUMENT', 'collusion `at` must be ms or an ISO timestamp', 'omit it to use the injected clock')
      const perPost = postId === null ? [] : (postOf(postId) ? scanFor(postOf(postId)) : [])
      if (postId !== null && !postOf(postId)) throw deny('VMU_NO_SUCH_OBJECT', 'no such auction: ' + String(postId), 'posts: ' + (order.join(', ') || 'none'))
      const affinity = scanAffinity(ms)
      return {
        ok: true, enabled: collusionScanOn, windowMs: collusionWindowMs, maxMutualShare: collusionMaxMutualShare,
        minEvidence: collusionMinEvidence, onSuspect: collusionOnSuspect,
        found: perPost.concat(affinity), marks: suspects.slice(), marksDropped: suspectDropped.n,
        note: 'the scan REPORTS (default `report`); it never auto-punishes, the criteria are recomputable, and every mark is visible in status()',
        at: ms,
      }
    },

    /** READ-ONLY list of posts (newest last), with bid counts, state and deadline. */
    list({ state = null } = {}) {
      const rows = order.map((id) => {
        const p = posts.get(id)
        return { postId: p.id, taskId: p.taskId, state: p.state, budget: p.budget, deadlineMs: p.deadlineMs,
          postedAt: p.postedAt, bids: p.bidOrder.length, closeRule: p.closeRule, awarded: p.awarded ? p.awarded.to : null,
          cancelled: p.cancelled ? p.cancelled.reason : null, reviewFrozen: p.reviewFrozen }
      }).filter((r) => state === null || r.state === state)
      return { ok: true, count: rows.length, posts: rows, open: rows.filter((r) => r.state === 'open').length, at: clock() }
    },

    /** READ-ONLY self-report: the whole market state, including the collusion marks (never silent). */
    status() {
      let bidsTotal = 0
      for (const id of order) bidsTotal += posts.get(id).bidOrder.length
      return {
        ok: true, apiVersion, configured: enabled, enabled, claimFirst,
        closeRule: closeRuleSetting, tieBreak, bidWindowMs, maxBidCost, maxOpenAuctions, minBids, maxBids, maxPosts,
        requirePlan, awardNeedsRationale, cancelNeedsReason, collusionScan: collusionScanOn,
        reputationInPrice, trustUseInAuction,
        openAuctions: openPosts().length, posts: order.length, bidsTotal,
        counters: Object.assign({}, counters),
        refusals: objOf(refusalCounts), refusalsTotal: sumOf(refusalCounts),
        dropped: { posts: postDropped.n, bids: counters.bidDropped, suspects: suspectDropped.n, total: postDropped.n + counters.bidDropped + suspectDropped.n },
        caps: { maxPosts, maxOpenAuctions, maxBids, maxSuspects },
        collusion: { enabled: collusionScanOn, onSuspect: collusionOnSuspect, windowMs: collusionWindowMs,
          maxMutualShare: collusionMaxMutualShare, minEvidence: collusionMinEvidence,
          marks: suspects.length, suspects: suspects.slice() },
        at: clock(),
        note: 'market mechanism (docs/17 §10/§17): the close rule is declared up front, reputation never prices a bid, silence is never used to hide duplicate bids',
      }
    },
  }
  return api
}
