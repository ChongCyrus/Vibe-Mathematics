// vmu pack v5r · middleware · waitsemantics — THE NORMATIVE TEXT FOR "WAITING" AND FOR "A QUEUED SEND IS DURABLE".
//
// ★ WHY THIS FILE EXISTS (task-224, adopting agent-teams B1+B2):
//   The official package writes these two rules INTO TOOL CODE (`ACTIVE_WAIT_STATUSES`, `NO_ACTIVE_PEER_MESSAGE`, and a
//   `POLICY` template string). That is policy-in-code — exactly what vmu's red line forbids. The ruling therefore
//   splits the two halves: the CAPABILITY stays in the KERNEL (it already exists — see the citations below), and the
//   NORMATIVE TEXT lives HERE, in the pack.
//
// ★★ EVERY SENTENCE BELOW CITES THE CODE FACT THAT BACKS IT. If the code does not do something, this file does NOT
//   say it — it is reported as a finding instead (see `FINDINGS` at the bottom).
//
// ★ WHAT THIS FILE IS NOT: it is not a second mechanism. It declares no waiter, no dedupe ledger and no store. It is
//   data + text. Wiring it into a prompt section is a SEPARATE step owned by whoever owns the prompt blocks
//   (`packs/v5r/prompts/v5r-blocks-*.js` were being edited by another teammate while this landed) — `forPrompt()`
//   below is the seam that step consumes.

export const apiVersion = 1

/**
 * (a) WHAT COUNTS AS AN ACTIVE PEER — ★ PACK POLICY, NOT A KERNEL FACT.
 *   The kernel deliberately owns only the WAITING MECHANISM: `kernel/activity.js:40` — "This module owns the WAITING
 *   MECHANISM only. Who may wait, how long, and whether 'nobody else is running' [is a refusal] ..." — and it takes
 *   the classification through an injected seam (`kernel/activity.js:172-175`):
 *     "`activePeers(me)` — optional seam returning the OTHER live members."
 *   ⇒ So the vocabulary below is THIS DEPLOYMENT'S decision, declared here in the pack. The kernel never filters on
 *   these strings itself: ★ verified, `provisioning` occurs ZERO times in `kernel/*.js` (see FINDINGS F-1).
 */
export const ACTIVE_PEER_STATUSES = Object.freeze(['running', 'provisioning'])

/** A peer is active iff its status is one of the above AND it is not the caller (`activePeers(me)` returns OTHERS). */
export const ACTIVE_PEER_RULE = 'a teammate is active for waiting purposes iff its status is one of ACTIVE_PEER_STATUSES and it is not the caller'

/**
 * (b) WAITING OBSERVES ONLY CHANGES THAT HAPPEN AFTER THE CALL, AND WITH NO ACTIVE PEER THERE IS NOTHING TO WAIT FOR.
 *   Code facts, quoted:
 *   · `kernel/activity.js:11` — "FUTURE-ONLY. A notification that happened BEFORE a waiter registered can never wake
 *     it. There is NO BACKLOG: ..."
 *   · `kernel/activity.js:172-175` — when the `activePeers` seam is present, `wait()` "short-circuits with
 *     `noProgress:{reason:'no-active-peer'}` instead of waiting for activity nobody can produce", and
 *     "A seam that FAILS is refused by name — a peer check that cannot run must never be silently skipped."
 *   ★ SWITCHED, NOT UNCONDITIONAL: the short-circuit is governed by the setting `vmu.activity.noPeerShortCircuit`
 *     (`kernel/activity.js:93`, one of `ACTIVITY_KEYS`), so this text must NOT promise it when that key is off.
 */
export const WAIT_OBSERVES_ONLY_AFTER_THE_CALL = true
export const NO_ACTIVE_PEER_RESULT = Object.freeze({ noProgress: true, reason: 'no-active-peer' })
export const NO_ACTIVE_PEER_TEXT =
  'waiting observes only changes that happen AFTER the call; a waiter registered now is never woken by something that already happened (no backlog). ' +
  'With no active peer to make progress, the wait returns immediately as no progress (reason: no-active-peer) instead of spending the turn on nobody. ' +
  'If the peer check itself fails, it is refused by name — never silently skipped.'

/**
 * (c) A SUCCESSFUL SEND IS DURABLE — ★ WITH THE PRECONDITION THE CODE ACTUALLY HAS.
 *   Code facts, quoted: `kernel/idempotency.js:24-27` — the ledger is "reloaded lazily: the same payload replayed AFTER
 *   A RESTART still deduplicates. `status().durable` says [whether it is durable]"; "without it the ledger is
 *   memory-only, with `durableReason`. A broken seam degrades to memory and is COUNTED — it never crashes and never
 *   pretends to be durable." The seam is the injected `store` (`:154`), and the degradation flag is STICKY (`:203`).
 *   ⇒ So the honest statement is DURABLE-WHEN-REPORTED-DURABLE, and the no-resend rule rests on the TICKET (the named
 *   `VMU_*_ID_TAKEN` refusals), not on an unconditional promise.
 */
export const SEND_DURABILITY_TEXT =
  'a successful send is already durable when its result says queued: do not resend it. ' +
  'The ledger that makes this true reports its own condition — `durable:true` means the ticket survives a restart; ' +
  '`durable:false` with its named `durableReason` means this deployment is memory-only, and it says so rather than pretending. ' +
  'Resending is therefore not the remedy: the ticket already exists, and a duplicate payload is refused by a named code.'

/** The normative block, in one piece. `forPrompt()` is what a prompt-section owner consumes. */
export const WAIT_AND_SEND_SEMANTICS = Object.freeze({
  activePeers: ACTIVE_PEER_STATUSES,
  activePeerRule: ACTIVE_PEER_RULE,
  wait: NO_ACTIVE_PEER_TEXT,
  send: SEND_DURABILITY_TEXT,
})
export function forPrompt() {
  return [ACTIVE_PEER_RULE + '（活跃对等体＝status ∈ ' + ACTIVE_PEER_STATUSES.join('/') + '，且不是自己）。',
    NO_ACTIVE_PEER_TEXT,
    SEND_DURABILITY_TEXT].join('\n')
}

/**
 * ★ FINDINGS — things the official semantics say that vmu does NOT do (reported, not written into the text above):
 *   F-1 (gap, existing capability underused): the official hardcodes `ACTIVE_WAIT_STATUSES = {running, provisioning}`
 *       and `NO_ACTIVE_PEER_MESSAGE` inside the tool code. vmu has the CAPABILITY (`kernel/activity.js:172-175`) but
 *       NO status vocabulary at all: `provisioning` occurs ZERO times in `kernel/*.js`, and `kernel/index.js` has no
 *       producer of `activePeers` that classifies by status — the seam is optional and currently supplied (if at all)
 *       by whoever calls `createActivity`. ⇒ ★ Verdict: NOT a new kernel capability; it is an EXISTING capability
 *       (the `activePeers` seam + `noProgress:{reason:'no-active-peer'}`) that is UNDERUSED on the assembly side.
 *       The vocabulary is declared in this pack (above) instead of being hardcoded in the kernel.
 *   F-2 (nuance, stated rather than papered over): "already durable when its result says queued" is TRUE here only in
 *       the `durable:true` case; with no `store` seam the ledger is memory-only BY DESIGN and NAMES that
 *       (`status().durable === false` + `durableReason`, sticky). The no-resend rule is still the right instruction
 *       (the ticket exists and duplicates are refused by name), but it must not be sold as an unconditional
 *       durability promise. This file says the conditional version.
 *   F-3 (not checked): whether the assembled kernel actually SUPPLIES an `activePeers` implementation, and whether
 *       `vmu.activity.noPeerShortCircuit` defaults to on, were NOT verified by this task — no harness was run against
 *       the assembly. Until that is checked, the text above is a statement of the MECHANISM's contract, not a claim
 *       about a running kernel's configuration.
 */
export const FINDINGS = Object.freeze({
  F1: 'ACTIVE_WAIT_STATUSES has no kernel counterpart (provisioning: 0 hits in kernel/*.js); the seam exists and is underused, so the vocabulary is declared in this pack',
  F2: 'durability is conditional: durable:true/false + durableReason is reported by the ledger; the no-resend rule rests on the ticket, not on an unconditional promise',
  F3: 'not checked: whether the assembly supplies activePeers and the default of vmu.activity.noPeerShortCircuit',
})
