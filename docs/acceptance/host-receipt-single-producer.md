# Host receipt single producer (TB-2668) — criterion, exception tables, the 38 bounded elisions, and the Phase 2 refusal facts

Gate: `tests/audit-host-receipt-superset.mjs` (Phase 1 mode: default `--faces explicit`; Phase 2 mode: `--faces spec`)
Board: `task-148` / `task-150` (Phase 1, §1–§4), Phase 2 = `task-155` / TB-2673 (recording Proxy over the factory faces, §5–§7).

## 1. What the gate asserts

For every measured point of the seven **explicit** tool faces written in `vibe-math-vmu/host.js`
(`status:516`, `set:850`, `middleware:964`, `records:1023`, `direction:434`, `script:1577`, `pack:1634`):

```
kernelKeys - hostKeys === 0        (success receipts: class A)
refusalFacts(kernel) - receipt   === 0   (refusal receipts: class B, reported separately)
```

The registry is enumerated at runtime from `host.toolSpecs()` (`host.js:481`) — never hand-copied. The measured
numbers are printed by the gate itself: **58 faces / 484 actions** published by the registry, of which **51 factory
faces / 460 actions** are Phase 2 (`PENDING_SCOPE`) and **7 faces / 27 points** (14 compared + 13 named-unmeasured)
are Phase 1. The taskbook's "99 faces" is a stale count; the registry is the source of truth.

Every missing key is printed by name as `tool/action/path/kernelSource`, grouped by tool with the branch line. Nothing
is silently skipped: kernel-less points are named as `HOST-VALIDATED` (refused before any kernel call), `HOST-OWNED`
(no kernel call, must be declared in `NOT_FROM_KERNEL`), `HELPER-ONLY`, or `DECLARED-COMPOSED`.

## 2. The four exception tables (shared with Phase 2 — Phase 2 may not add a second table)

| table | shape | rule |
| --- | --- | --- |
| `REKEYED` | `{from: {to, verify, absent?}}` | a rename is verified by value at runtime (row-id lists must be literally equal) and the original key must be **absent** from the receipt (R1: a rename replaces, it does not copy). |
| `WRAPPED` | `{ns, why, decidedBy}` | the kernel receipt is nested whole under one namespace and compared **inside** it. R1: if the kernel keys also appear flat at the top level, the namespace wraps nothing and the entry must be deleted (gate goes RED). |
| `NOT_FROM_KERNEL` | `{composedOf?: [...], parts?: [...], keys?: [...], boundedSections?: [...], internalReads?: [...], why}` | the face composes (or does not come from) a kernel receipt. Every key of every named view that does not survive is printed in `suppressed` **by name**; a named view with no visible key at all is a table error (anti-mask). R1: a named `internalReads` call that IS forwarded, or a `boundedSections` face whose top level stops being forwarded, disarms the entry (RED). |
| `PENDING_SCOPE` | generated | every factory face with its action count; generated from the registry, never typed. |

`HOST_HIDDEN_KEYS` is empty today: every key measured missing is a loss, not a deliberately hidden reading.

## 3. The 38 bounded elisions on the default `vibe_vmu_status` receipt

The default (no `detail`) status receipt is the **ROUND-22 bounded summary** asserted by `tests/vmu-host.test.mjs`
(< 8000 B): bulky kernel sections are replaced by small summaries that each carry a pointer to the full reading. This
is a deliberate, named view — not a key-picking bug — and is declared in `NOT_FROM_KERNEL['vibe_vmu_status/-']` with
`boundedSections`. The gate prints these keys in its `suppressed` section, and asserts that the declaration is
**earned** (a bounded declaration must actually suppress something, otherwise the gate goes RED).

Who decided: the ROUND-22 readability contract; approved as a declared bounded view by the Lead's ruling on
2026-11-09 (`task-150` acceptance, constraint 1). The elided keys are:

| section | elided kernel keys (38 total) |
| --- | --- |
| `settings` (11) | `detail`, `resolvedDetail`, `resolved`, `hotGrading`, `applies`, `liveReaders`, `runtimeWrites`, `lastRuntimeWrite`, `settingsRejected`, `settingsRejectedCount`, `settingsUnenforced` |
| `bus` (4) | `dryRun`, `hookTimeoutMs`, `breakerThreshold`, `hooks` |
| `prompt` (5) | `bindings`, `truncation`, `middlewareAppends`, `replacedSections`, `replacedCount` |
| `loader` (3) | `frameworkApiVersion`, `dryRun`, `stats` |
| `bridge` (6) | `dryRun`, `defaultTimeoutMs`, `stats`, `recent`, `promptSurface`, `note` |
| `math` (4) | `spawnSeamKindMeans`, `toolsPublished`, `publicationReuse`, `publicationMeans` |
| `closureVote` (5) | `windowMeans`, `rulingReading`, `castMeaning`, `notEligibleMeans`, `reason` |

**If you are a reader and need one of these keys:** call the same tool with `detail:"full"` (the full status receipt is
forwarded whole; that path is asserted by the same gate). For sections with a note, the receipt itself names the door
(e.g. `settings.note`, the `proseOmitted`/`proseWhere` pair on `closureVote`, `detail:"full" for the bus table`).

**Maintenance (why this list is in a document at all):** elided keys cannot go red — only missing inputs can — so the
document is the only place a reader can discover them. Two rules keep it honest:

1. A **new top-level** key on the status receipt is class A unless the branch forwards it (the bounded licence covers
   named sections only; asserted by self-test 13 and by the live class-A check).
2. If the kernel adds a key **inside** a bounded section, the gate reports it in `suppressed` by name (it does not go
   red, by design) — whoever changes the summary must update this table in the same change.

## 4. Reverse-lamp evidence

- `--plant-hide=kernel.status:bus` ⇒ gate RED and names `vibe_vmu_status/-:bus`.
- Temporarily replacing the status branch's whole-receipt spread (`host.js:618`) with a two-key pick ⇒ gate RED with
  class A and `NOT_FROM_KERNEL disarm`; restoring the file byte-for-byte (`sha1sum -c`) ⇒ gate GREEN.
- `--self-test` (14 assertions) proves the judge can go red for every declared exception shape and that each exception
  is honoured only when it describes the real shape (R1 for `REKEYED` duplication, `WRAPPED` flattening,
  `internalReads` forwarding, `boundedSections` elision and disarm).

## 5. Phase 2: the recording Proxy over the 51 factory faces / 460 actions

`--faces spec` boots the same kernel and host, wraps the kernel services in `tests/lib/recording-kernel.mjs`
(`recordKernelReceipts`: read-only Proxy, depth ≤ 3, `looksLikeReceipt` predicate for `{ok|code|action}` receipts,
Promises captured after they settle and re-thrown as-is, one entry per object identity), calls every
`(tool, action)` the registry publishes, and compares `union(recorded receipt keys) − face receipt keys` with the same
four tables. A point whose kernel answer is not a receipt shape is named (`noReceiptShapedAnswer`), a point where the
host refuses before calling the kernel is named (`refused-before-kernel`), a thrown face is `unreachable` — none of
these counts as a pass.

Measured (registry: **58 faces / 484 actions**, all named): **484 points → 298 compared, 105 refused-before-kernel,
4 refused-without-matched-receipt, 1 noForwardedReceipt, 76 noReceiptShapedAnswer, 0 unreachable**;
**class A = 0, class B = 0**.

### 5.1 Newly forwarded refusal-fact keys (per tool)

These keys were already computed by the kernel *before* it threw / returned the refusal, and were then dropped because
each face rebuilt the refusal with `refused(code, message, hint)` — the fourth argument was simply never passed. They
are now forwarded verbatim; no key was added, renamed or removed by the faces.

| tool | actions (count) | forwarded refusal facts |
| --- | --- | --- |
| `vibe_vmu_records` (host.js explicit branch) | get, expand (8) | `enforced`, `enforcedScope`, `wouldEvaluate`, `op` |
| `vibe_vmu_conference` | submit, assign, review, decide, register, planAgenda, viewSubmission, list (32) | `enforced`, `fired`, `enforcedScope`, `refusedAt` |
| `vibe_vmu_arbitration` | open, appoint, pick, declareConflict, recuse, hear, rule, appeal (10) | `enforcedScope` |
| `vibe_vmu_mathtools` | plan, run, cacheMarkCorrupt (9) | `enforced`, `enforcedScope`, `evaluated` |
| `vibe_vmu_audit` | append (1), recount (2 facts: `+byRole`, `+declared`), rotate (4 facts: `+approxBytes`, `+rotateBytes`, `+rotateDaily`) | `enforcedScope`, `byRole`, `declared`, `approxBytes`, `rotateBytes`, `rotateDaily` |
| `vibe_vmu_collab` | openAgreement, signAgreement, reviewAgreement, exchange, settle, authorship (6) | `detail` |
| `vibe_vmu_custody` | transfer, storageCycle, destroy, chainOf (4) | `detail` |
| `vibe_vmu_topology` | select, route, assert (3) | `enforcedScope` |
| `vibe_vmu_explain` | checkReason, correlate, build (3) | `detail` |
| `vibe_vmu_external` | fetchOne (3) | `enforced`, `enforcedScope`, `evaluated` |
| `vibe_vmu_publication` | submitPack, replication, outreachPack (3) | `missing` |
| `vibe_vmu_retention` | restore (2 facts: `enforcedScope`, `id`), trash (1) | `enforcedScope`, `id` |
| `vibe_vmu_citations` | validate, render (2) | `detail` |
| `vibe_vmu_human` | liftVeto, recover (2) | `detail` |
| `vibe_vmu_task` | advance (1) | `enforcedScope` |
| `vibe_vmu_discipline` | restore (1) | `detail` |
| `vibe_vmu_ratelimit` | reset (1) | `key` |

Fix shape (one added argument per face catch, nothing else touched):

```js
// before
return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
// after
return refused(e.code || 'VMU_STATE', String(e.message), e.hint, e)
```

`host.js:497 refused(code, message, hint, extra = null)` has always accepted the fourth argument and merges
`refusalFacts(extra)` into the receipt (`host.js:1901`; it excludes `ok/code/message/hint/name/stack`, requires
`enforced` to be an array, skips `undefined`/functions/symbols/`Error`, truncates long strings at 4000). The
`records` `get`/`expand` branch is the only branch that *rebuilds* a refusal (it reads two stores, `rc.get` then
`library.expand`), so it now merges both caught errors: `Object.assign({}, e, e2)` in the same fourth-argument slot.

**General rule (failure receipts):** when the kernel refuses, every decision fact it already computed before refusing
(`enforced`, `enforcedScope`, `wouldEvaluate`, `op`, `fired`, `refusedAt`, `missing`, `detail`, `key`, …) is part of
the tool receipt; the host's fallback prose (`message`/`hint`) may decorate a refusal but must never replace those
facts. A catch that reduces an `Error` to `(code, message, hint)` is a receipt regression, not a simplification.

> The normative home of this rule is the live interface contract, **`vibe-math-vmu/docs/03-interface-contract.md`**
> (failure-receipt section, directly after the TB-2668 single-producer rule: 「内核拒绝时已经算出的判定事实，必须出现在
> 回执里；宿主兜底文案不得替代事实」). This page keeps the Phase 2 measurement that enforces it; it is not a second
> contract.

### 5.2 Named boundaries (not gaps, do not "fix" by loosening the predicate)

| bucket | count | why it is not a finding |
| --- | --- | --- |
| `refused-before-kernel` | 105 | the host validates and refuses before touching the kernel (missing id/state seed); Phase 1 measures this class separately and it is a host-answer, not a kernel receipt. |
| `noReceiptShapedAnswer` | 76 | the kernel answers with an array/primitive/status table rather than a receipt (`kernel.status()` has 39 keys but no `ok`/`code`/`action`; `tasks.list()` returns an array; `clockguard.now` returns a number). Per the §3.1 predicate in TB-2673 these points are unmeasurable, and they are all named by tool/action. |
| `refused-without-matched-receipt` | 4 | the face refused after calling a kernel *helper* whose answer carries no `code`: `meeting/speak` + `meeting/extend` (recorded `kernel.meetings.status`, face self-validates the meeting id), `meeting/ballot` (recorded `kernel.meetings.eligibleVoterIds`, face requires `target`), `idempotency/reload` (face answers `ok:false` with no code). The kernel did not refuse, so there is no refusal fact to forward. |
| `noForwardedReceipt` | 1 | `meeting/list`: the kernel calls `liveList`, which is not receipt-shaped (array of primitives); the face composes its own list. Named exception, kept (not declared away). |

### 5.3 Attribution correction (27 → 4) and why it is not a loosened predicate

The first Phase 2 run matched a refusal only against recorded **thrown `Error`** receipts, so 23 points where the
kernel **returned** a plain refusal object (`{ok:false, code, hint, …}`) and the face forwarded it correctly were
listed as `refused-without-matched-receipt`. The attribution now matches any recorded receipt (error *or* object)
whose `value.code` equals the face's `code`. This is attribution, not permission: the 23 points moved into
`compared`, where their receipts still have to pass class A/B (they do, 0/0), and the remaining 4 are the helper-read
cases named in §5.2.

## 6. Phase 2 reverse-lamp evidence

- Delete the newly added `, e` from `vibe-math-vmu/tools/custody.js` (line 27) and run
  `--faces spec --only=vibe_vmu_custody/transfer` ⇒ exit 1, `transfer -> detail`, `FAIL Phase 2 class B …
  {"missingFacts":1}`. Restore the file byte-for-byte (`sha1sum -c`) ⇒ exit 0. The gate really watches this argument.

## 7. Regression for this change

Phase 1 gate 13/13 ok (`class A 0 / class B 0 / PENDING_SCOPE 51`), Phase 2 gate 6/6 ok, `--self-test` 22/22,
`tests/vmu-host.test.mjs` 252/0, `tests/audit-receipt-fields.mjs` and `tests/audit-face-actions.mjs` green.
