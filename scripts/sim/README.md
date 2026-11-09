# scripts/sim — the fidelity simulator

Purpose: exercise the *whole* institute lifecycle **in one process, without an LLM**, and keep
everything a reviewer needs as files (receipts, the exact prompt each seat would have seen, the
filesystem tree after every step). Real runs cost 20–30 minutes and burn tokens; this costs
seconds, so it is where mechanisms are checked and where prompt texts are inspected.

It is not a replacement for the real run: real runs test *model behaviour*, this tests
*mechanism behaviour*. A green corpus proves the machinery answers correctly; it cannot prove a
model will use it.

## Run it

```bash
node scripts/sim/run.mjs --scenario mainline --out D:/_tmp/sim/corpus-mainline
node scripts/sim/audit/receipts.mjs D:/_tmp/sim/corpus-mainline
```

`--scenario` defaults to `mainline`; `--keep` keeps the workspace (default: kept for the last run
so you can look at the tree); `--root` overrides the scratch root.

Adding a scenario is *only* adding a file: `scripts/sim/scenarios/<name>.mjs` exporting an async
function named `<name>` (or `scenario`/`default`). `run.mjs` discovers the directory, so two
authors never edit the same registry.

```js
export const meetings = async (h, { log }) => ({ steps, receipts, highlights, tree })
```

## What a scenario may assume

- `h.boot()` already ran: the real pack `apply()` registered **every** tool through the real host
  path, so receipts are the same objects the real run would see.
- `h.call(name, args, { as })` — `as: { agent: { id: 'r-1' } }` makes the call *that seat's own
  act* (`memberActed: true`); omit `as` to act as the office. This distinction is load-bearing:
  the office orchestrating for a seat is not the same act as the seat carrying it out.
- `h.prompts.assembleFor({ seat: 'chair'|'member'|'temp', phase })` — the real pipeline, with the
  real `bindings` and `settings`. A simulator that skips them reports a shorter prompt than the
  real one and therefore reports headroom that does not exist (this was a real gate bug, RUN 226).
- `h.snapshotTree()` — `[{ path, bytes, sha256 }]` for the workspace.

## What the corpus contains

```
manifest.json    scenario, root, tool list, counts, refusal ledger, pairs summary
receipts.jsonl   one line per call: { seq, step, tool, args, receipt, ... }
prompts.jsonl    one line per assembly: { seat, phase, chars, text, assembly, afterReceipts }
prompts/         the same prompts as files, one per assembly: <seq>-<seat>.txt
pairs.jsonl      one line per receipt: the receipt text + where it sits in the NEXT prompt
pairs/           the same pairing as files, one per pair: <nn>-<seat>.txt
tree.json        the workspace tree at the end
steps/           one file per step, the full receipt (for reading, not parsing)
REPORT.md        the human summary (steps, refusals, files before -> after)
```

`node scripts/sim/run.mjs --scenario end-to-end --out D:/_tmp/sim/e2e` is the full-lifecycle
corpus (start -> hire -> proposition -> blueprint -> meeting -> records -> paper -> final), and it
is the one the gate below runs.

Refusals are split into **mechanism** (our bug: a legal sequence was refused, or an illegal one
was accepted) and **environmental** (a seam this process does not have: no LLM to spawn, so
`compile` cannot run). Only mechanism refusals fail a scenario.

## The delivery boundary: three refusals, three owners (TB-2630)

A turn can fail at two different boundaries, and blaming the wrong one sends the next reader to the
wrong file. The simulator must be able to *reproduce* each fact, so `replyTextOf()` names four
answers (text = a string, `ContentBlock[]`, `{text}` or `{reply}`; an unrecognised object = SHAPE;
`null`/`undefined` = NO PAYLOAD) and the scripted adapter throws the fault at the seam.

| what happened | code | who judges it | how the sim produces it |
| --- | --- | --- | --- |
| the MEMBER wrote prose with no fence and no tool report | `VMU_TURN_NO_FENCE` | the kernel, on a *good* adapter (the reply text) | `deliver: async () => 'prose with no fence'` — prose is returned unchanged |
| the ADAPTER handed back a shape the boundary cannot read | `VMU_TURN_DELIVERY_SHAPE` | the harness seam (the kernel's own door uses the same code for a raw seam) | `deliver: async () => ({ output: [{ type: 'text', text: 'hi' }] })` |
| the ADAPTER handed back nothing at all | `VMU_TURN_DELIVERY_NO_PAYLOAD` | the harness seam (the kernel names `null` as a shape error — the harness is finer on purpose) | `deliver: async () => null` |

MEASURED LIMIT (TB-2630, kept as a fact rather than smoothed over): through `vibe_vmu_turn {op:"drive"}`
the receipt still carries `VMU_ENGINE_UNAVAILABLE`, because `kernel/turn/index.js` re-labels every error
from the one-shot start into "the host refused to start this member turn twice" — the adapter's own code
survives in the refusal *message* and in `h.delivered[i].faultCode`, not in the receipt's `code`. The
kernel's adapter-shape door is only reachable from a raw delivery seam, which is why the parity
assertions drive `createTurnOrchestrator` directly. `tests/sim-harness-shape.test.mjs` pins both halves,
so a future kernel fix flips one assertion instead of leaving the gap undocumented.

## The audit

`scripts/sim/audit/receipts.mjs <corpus>` checks observations, not source:

| check | question |
| --- | --- |
| A1 | did any step refuse? (mechanism = finding) |
| A2 | does any receipt serialize `undefined`, `[object Object]`, `NaN`? |
| A3 | did a write action change no file and no row? |
| A4 | is a refusal missing its `hint` / `means` (where the field exists)? |
| A5 | is a refusal code not registered in `docs/03-interface-contract.md` §8? |

## Coverage debt: walk the real path, never declare an exemption (TB-2643)

`audit/all.mjs` §5 compares every receipt against the LIVE field list (`D:/_tmp/sim/real-fieldset.json`, refreshed by
`scripts/sim/harvest/real.mjs`). When a refresh exposes a field the simulation never produced, the fix is a step on
the real path plus a HARD assertion — not a line in `scripts/sim/audit/fidelity-declared.json`:

- the step calls the public face and lets the kernel publish the field (`fidelity-extra.mjs` G11–G14 cover the
  2026-11-09 refresh: `p1GateSkipped` on a same-p rewrite, the leave face (`approver`/`decidedAtMeans`/`requests`/
  `undecidedRequests`), `turn.at` on the nothing-to-abandon branch, and `human.failedSteps` on a recovery that fails);
- `requireFields()` in that scenario turns a missing field into a non-empty `failures` array, so `run.mjs` goes red —
  a deleted step cannot silently become "0 missing, because 0 measured";
- a declaration is only for a gap that CANNOT be produced (a deployment/config shape), is key-scoped, names the seam,
  and says why it cannot be fixed in this repository. Declaration is the last resort, never the shortcut.
- also: a receipt from a SECOND kernel (`boot({root: other})`) never reaches the corpus or the audit. A field only
  counts when the MAIN handle produced it, which is why the two steps above run on `h`, not on a helper kernel.



`node tests/sim-gate.test.mjs` is the shipped gate. It runs three segments — `run.mjs --scenario
end-to-end`, `run.mjs --scenario meeting-matrix`, and `audit/all.mjs` — and each must exit 0 with
**zero mechanism refusals**, `advisory: 0`, `selfChecks.failed: 0`, receipts matching the manifest,
and each `pairs.jsonl` receipt text locatable byte-for-byte inside its next prompt. A fourth
segment replays `end-to-end` twice on a frozen clock and compares `pairs.jsonl` byte-for-byte
(the two declared normalisations are `consult-…` ids and `sha256:` digests; any other difference
fails). Budgets are 15 / 45 / 75 / 15 s per segment and **the 150 s total is a backstop, not an allocation**: each
segment fails on its own budget first, and a timeout names the segment plus its measured and budgeted time.
A cap alone would let the gate get quietly dearer, so each segment is also compared against the baseline
in `docs/acceptance/sim-gate-scope.md` (its `gate-baselines` line is machine-read by the gate) and may not
cost more than 1.25x it; past that the report says WHICH segment and by how many milliseconds.

What the gate proves and what it cannot prove is the one file `docs/acceptance/sim-gate-scope.md`
(three tables: provable by sim, only provable on a real run, tools already compared field-by-field
against live receipts). Two rules from that file are worth repeating here because they are easy to
break: **no self-exemption** (there is no "known red" list — a red scenario is a red gate) and **no
skips** (there is no `SIM_SKIP`; the only environment variable is `SIM_KEEP_CORPUS=1`, which keeps
the temp corpus and changes no assertion).

The gate also ships its own mutations, so it can be seen to bite: a copied scenario whose
`expectedRefusals` is reduced to a single blanket declaration must exit 1 with the second refusal
reported as `unpredicted`; a copied corpus whose one `receiptSpan` is shifted by a byte must fail
the byte-for-byte check on exactly that row; and `SIM_SELFTEST_FAILURE=<CODE>` must print
`scenario self-checks: 1 FAILED` and name the code.

## How the mutation copies work (do not skip this when writing one)

A mutation copy is a temporary file that reuses this directory's code with one deliberate change,
so it proves the *assertion* bites rather than proving that a copy of the code is broken. Two
things must be re-pinned inside the copy, or the copy dies before it tests anything: the `REPO`
constant (a copy living under `D:/_tmp` derives `D:/_tmp` from `import.meta.url`, and boot then
fails with `ERR_MODULE_NOT_FOUND` for a path that never existed) and any relative import of
`settings.mjs` (re-point it at the real file URL). A copy that fails to boot is not evidence — it
only shows the copy is wrong.

## Discipline

- A scenario must not "work around" a defect. If the legal sequence is refused, record the
  refusal and report it: the corpus is evidence, and a scenario bent to pass is worthless.
- Member acts use `{ as }`; if a scenario needs the office to act in a seat's name, that is a
  finding about the prompts, not a scenario convenience.
- Never measure prompt size from `role` names in the source (`academician`); the turn loop passes
  the roster **slot** (`chair`/`member`/`temp`). Measuring the wrong one is how the budget gate
  passed at 27 973 while the real chair prompt was 32 057.

## The compare gate: strict vs strict-content (TB-2631)

`scripts/sim/compare/run.mjs --strict` asks ONE question -- is the semantic contract consistent? -- so it fails
only when a semantic valueDiff (code/state/kind/ok, an ALL-CAPS refusal code) has no attribution; the designed-
unexplainable content diffs (each fixture writes its own agenda/body/hint prose, counts and lists) are counted in
`totals.tiers.content` and printed in the report, not failed. When the question really is "is the content
identical?", pass `--strict-content` (it implies `--strict`) and the same corpus fails on content alone. `diff.json`
carries `totals.tiers.{semantic,serialization,content}` (each with `total`, `unattributed` and a `means` sentence)
plus `checks.strictSatisfied` / `checks.strictContentSatisfied`; the markdown report prints the three tiers in §2b.

## The compare gate: like is compared with like (TB-2637)

A `tool.field` pair is only a contradiction if both sides produced the field **under the same call shape**. TB-2627
found the opposite: `inbox open` was compared with `inbox list`, `task assign` with `task transition`, and the
"differences" were two different mechanisms. Every valueDiff now carries `shapeKey = <tool>.<branch>.<field>`, where
`branch` is derived from the call's own tags (`action=open`, `kind=ruling`, `mode=hands`, or `default`); a field that
both sides carry but never under a shared branch is **`crossShape`**: it is counted in `totals.crossShape`, named with
both branch lists and shapeKeys, and never judged — no `valueDiff`, no tier, no strict failure. `*.fields.*` (a
caller-echoed panel field) is classified as `content`, not contract.

The corpus is only comparable if it is stamped. The authoritative stamp is the driver's **sealed `run-metadata`
event at the head of every journal it wrote** (TB-2641: `{"type":"run-metadata","build":"<sha>","buildSource":…,
"tarballBytes":…,"scannedJs":…}`, prepended as one complete zstd frame by `D:/_tmp/slv-phase5/journal-build-stamp.mjs`
after the server stops, so existing frames stay byte-identical). Harvest copies that build onto **every** row and
records provenance in `buildWhy` (`run-metadata:<source>`; a journal written before TB-2641 falls back to the old
`BUILD REV:` text grep and says `grep:BUILD REV`). Filtering: `--only-build <sha|HEAD|null|any>` (default `HEAD`),
where `<sha>` matches a short-sha prefix, `HEAD` resolves the current checkout, `null` keeps only rows without a
usable sha, and `any` disables the filter. Only a sha names a checkout, so a row labelled `working-tree` + `dirty:true`
counts as build=unknown and **never matches any sha**; such rows are excluded and counted by default, and if the
corpus has no usable stamp at all the filter falls back to the unknown rows and says so in
`meta.buildFilter.fallback` — the gate still measures instead of silently comparing an empty corpus. Harvest-side
and filter-side semantics are pinned by `tests/sim-build-stamp.test.mjs` (including the anti-false-green assertion that
deleting the metadata event makes the build assertion fail), and the pairing rules by
`tests/sim-compare-shapes.test.mjs`, including the anti-vacuity assertion that a contradiction under the *same*
shapeKey still turns `--strict` red.

Two of the seven TB-2627 entries were not shape bugs at all but **lifecycle** differences: the live corpus reassigned
an already-`assigned` task and expanded a card that had already become a `ruling`, while the sim corpus reassigned a
`doing` task and expanded an `open` card. The comparison cannot see the pre-state in the args, so the two scenarios now
carry a step that reproduces the live pre-state (`F/task_update/reassign-from-assigned` in `actions-extra`,
`G8/records/expand-ruling` in `fidelity-extra`); both steps hard-fail the scenario if they stop reaching the live
reading, and `tests/sim-compare-shapes.test.mjs` asserts the steps exist in the corpus by name.
