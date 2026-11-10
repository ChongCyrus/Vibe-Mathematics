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

## 8. Phase 3: the plugin layer (TB-2680)

Gate: `tests/audit-plugin-receipt-superset.mjs` (read-only: it boots the real `v5r` entry against a `tmpdir` root and
never edits product code or `package.json`). This is the third layer after Phase 1 (the seven explicit `host.js`
faces, §1–§4) and Phase 2 (the 51 factory faces behind the recording Proxy, §5–§7): the **plugin entry** forwards the
kernel's pack-apply receipt to the host status face, and that forwarding used to drop facts.

What it gates — branches are enumerated **at runtime**, never hand-copied: walk every function property of the plugin
`handle` and of `handle.adapter`; a branch is any returned object carrying an `appliedPacks` array. The kernel-side
truth is `handle.appliedPacks()` (the only plugin face that keeps the whole kernel entry, including `declarations`),
and every branch entry is compared against its key set, one level deep. Measured today: **branches=2, covered=2,
PENDING_SCOPE=31** (the 31 are handle/adapter functions that do not forward `appliedPacks`; they are counted, not
silently skipped), `kernelItemKeys=["applied","declarations","id"]`.

The defect this closed: `handle.packReport()` / `handle.packMerge()` and the two `createHostAdapter` seams
(`packReport`/`mergeReport`) all returned `appliedPacks: appliedPacks.map((a) => a.id)` — an id projection. So the
same receipt answered "which packs applied" twice from one producer, and the per-entry facts (`declarations`,
`applied`) vanished between the kernel and the host status. First run, red, before any product change:

```
plugin faces: branches=2 covered=0 pendingScope=31 kernelItemKeys=["applied","declarations","id"]
VERDICT: FAIL — 4 missing key(s) across 2 branch(es)
--- handle.packReport (handle.packReport())
  missingKey=declarations
  missingKey=applied
--- handle.packMerge (handle.packMerge())
  missingKey=declarations
  missingKey=applied
```

The fix follows the Lead ruling of 2026-11-10 and does **not** change the public shape of `appliedPacks` (an id
string array, frozen — `vibe-math-vmu/docs/29-build-your-own-preset.md:280` is a documented reader). A narrow name
keeps answering its narrow question; the full entry moves to a new, clearly named field, copied whole and never
key-picked:

- `vibe-math-vmu/vibe-math-vmu.js:746` — adapter `packReport` seam
- `vibe-math-vmu/vibe-math-vmu.js:791` — adapter `mergeReport` seam
- `vibe-math-vmu/vibe-math-vmu.js:1330` — `handle.packReport()`
- `vibe-math-vmu/vibe-math-vmu.js:1362` — `handle.packMerge()`

each now emits `appliedPacks: appliedPacks.map((a) => a.id)` (unchanged) plus
`appliedPacksDetail: appliedPacks.map((a) => Object.assign({}, a))` (same source array). `git diff --numstat` for the
file is `12 0`. The REKEYED table in the gate has exactly one entry — `appliedPacks → appliedPacksDetail`, why:
"appliedPacks is the public id-projection (unchanged by ruling); the per-entry facts live on appliedPacksDetail, and
both are produced from the SAME appliedPacks() array". The gate also asserts the shape contract (every `appliedPacks`
item is a string, `appliedPacksDetail` is an object array), so a future edit cannot satisfy "detail carries the keys"
by changing the old field's shape.

Four receipts, taken from the same boot (`v5r` via `vmu.packs.active`; all four are byte-identical by construction):

```
handle.packReport    {"appliedPacks":["v5r-core"],"appliedPacksDetail":[{"id":"v5r-core","applied":85,"declarations":{"folded":[],"unsupported":[]}}]}
handle.packMerge     {"appliedPacks":["v5r-core"],"appliedPacksDetail":[{"id":"v5r-core","applied":85,"declarations":{"folded":[],"unsupported":[]}}]}
status.packReport    {"appliedPacks":["v5r-core"],"appliedPacksDetail":[{"id":"v5r-core","applied":85,"declarations":{"folded":[],"unsupported":[]}}]}
status.settingsMerge {"appliedPacks":["v5r-core"],"appliedPacksDetail":[{"id":"v5r-core","applied":85,"declarations":{"folded":[],"unsupported":[]}}]}
```

(`status.packReport` / `status.settingsMerge` are the adapter seams as seen through the `vibe_vmu_status` receipt;
the tool returns a JSON string, so they were read after `JSON.parse`.)

Reverse lamps — run in a full-tree copy **outside the repository** (`D:/_tmp/tb2680-lamps/repo`, `.git` and
`node_modules` excluded; the repo itself was never mutated), each followed by a byte-for-byte restore:

| lamp (copy only) | observed |
| --- | --- |
| L1 delete all four `appliedPacksDetail` lines | exit 1; both branches print `missingKey=(appliedPacksDetail missing)` + `missingKey=declarations` + `missingKey=applied` |
| L2 add a new key `probeExtra` to the kernel entry **and** make `appliedPacksDetail` pick id/applied/declarations | exit 1; both branches print `missingKey=probeExtra [appliedPacksDetail exists but does not carry this key]` — the REKEYED table does not swallow undeclared keys |
| L3 make `appliedPacksDetail` keep `{id}` only (whole forwarding becomes key-picking) | exit 1; both branches print `missingKey=declarations` + `missingKey=applied` |

`SUMMARY lamps=3 problems=0 restoredShaEqual=true`. Green run after the fix:
`branches=2 covered=2 pendingScope=31` … `VERDICT: PASS`.

Stale taskbook note: TB-2680's write domain listed `vibe-math-vmu/middleware/**`, but that directory does not exist
in this repository. The actual forwarding site is the plugin entry `vibe-math-vmu/vibe-math-vmu.js`; the two adapter
seams live in the same file (the `createHostAdapter(...)` argument object), not under `middleware/`. Nobody should go
looking for `middleware/` — this line is the correction.

Old-document inconsistency, recorded but deliberately not changed this round: `vibe-math-vmu/docs/29-build-your-own-preset.md:280`
says `appliedPacks: ["v5r-core"]` (id array) while `docs/acceptance/04-parity-matrix.md:1634` says
`appliedPacks 保留 = [{"id":"v5r-core","applied":32}]` (object array). The ruling keeps `appliedPacks` as the id
array and puts whole entries on `appliedPacksDetail`, so the parity-matrix line is the stale one; it is a historical
reading, outside this round's write domain, and editing history to match today is exactly what "record, not
rewrite" forbids.

Regression: `tests/vmu-entry.test.mjs` 159/0, `tests/vmu-run256-pack-declarations.test.mjs` 45/0,
`tests/vmu-run258-pack-declaration-gate.test.mjs` 43/0, `tests/vmu-packs-active-switch.test.mjs` 24/0,
`tests/vmu-pack-defaults-named.test.mjs` 39/0, `tests/vmu-packs-add-not-remove.test.mjs` 12/0,
`tests/vmu-pack-inline-manifest.test.mjs` 42/0, `tests/vmu-pack-plan-rule-validate.test.mjs` 35/0,
`tests/vmu-pack-prompt-policy-live.test.mjs` 25/0, `tests/audit-host-receipt-superset.mjs` class A 0 / class B 0
(pendingScope 51 faces / 460 actions). Reproduce the gate with
`node tests/audit-plugin-receipt-superset.mjs` (exit 0 = no unexplained drop).
