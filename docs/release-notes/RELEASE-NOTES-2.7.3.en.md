# dsh-vibe-math 2.7.3 — Release Notes (English)

> Previous release: 2.7.2. This is a **PATCH release containing fixes, wording corrections and verification depth only** — v5 institute **round numbering and mailbox delivery** no longer go wrong, paper finalisation and task compare-and-set failures now carry named consequences, v4 no longer fails silently when the Lean library index or the project marker cannot be written, installer output uses one language with exactly one line per action, and the **stale mailbox ordering** that survived in the documentation was corrected everywhere with an automated prose↔code pairing check. Parameter defaults, data formats and the directory layout are **unchanged** (asserted by `tests/audit-math-computation-contract.mjs` and `tests/audit-math-computation-parity.mjs`); every addition is **additive** or **test-surface only**, so existing readers are unaffected. There are **no breaking changes**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- **The mailbox no longer loses messages**: acknowledgement happens **only after a successful send**; an unacknowledged message stays pending and is re-delivered on the next successful wake. Duplicate suppression uses the **injection marks** (`inboxInjected` / `inboxSuppressed`), and a round never prepends the same message twice.
- **Predictable round numbers**: a founding prompt carries the round the member **actually starts** (from `轮次 1`, never `轮次 0`); a **failed** start consumes no round and no longer **erases or resets** an existing member's count (after the host loses a child session, a rebuilt prompt continues the numbering, e.g. `轮次 2`).
- **Paper finalisation failures are traceable**: a failed write of a **required** artifact (`paper.md` / `paper.tex` / `paper.meta.json` / `paper.log.md`) produces a **named warning exactly once**, naming the artifact and the recovery path; the artifact list contains **only what actually landed**; re-running finalisation refills missing artifacts **idempotently** without multiplying warnings.
- **A refused task compare-and-set leaves no half-state**: when `expected_revision` is stale the task is **unchanged** (verified by reading back `revision` / `ownerId` / `status`).
- **A member path-contract mismatch is named**: when the documented member-library root differs from the root the framework actually reads and writes, the mismatch is surfaced by name — and that note now **reaches `report()` diagnostics** (it used to be queued and never shown).
- **v4 index write failures have a named consequence**: a failed Lean library index write is named **exactly once**, with `lib=` / `proved=` and the consequence that the index is **stale until the next successful rebuild**; that single site covers every caller and **does not change the return value** (the tool still answers with its scanned counts).
- **v4 project-marker write failures have a named consequence**: a failed write of the current-project marker `.current` is named once, with the consequence that the next session may load the previous project.
- **The documentation no longer describes the message-losing order**: the stale mailbox ordering (acknowledge first, build later) in the plan, the architecture diagram, the pseudocode block and the guard checklist was corrected to "**build first; acknowledge only after a successful send; no duplicate prepend within a round**", backed by an automated **prose↔code pairing check** (the old wording fails it, and it requires the implementation anchor `if (ok && prompt.pending.length) await ackPending(`).

## Added

- A **per-preset machine-face field table** in the shipped `docs/status-report-fields.md` (columns: name / scope / which-views / meaning): v2 **20** rows, v3 **25** rows, v5 **43** rows (derived from each `status()`), while v4 states explicitly that it exposes **no** `fieldScopes`; the table is checked **in both directions** (every source field has a doc row; every doc row names a real source field).
- **Deeper verification in the gate**: it now runs **101 jobs = 44 suites + 57 probes/variants** (65 jobs = 44 + 21 at 2.7.2, recomputed from that tag's job-list rule), including shipped **mutant families** (`tests/*.mutants.mjs`) and `--self-probe` modes that run a **mutated copy** and require a **named** failure rather than only an exit code.
- **Audit seams that can target a copy**: several audits accept an environment variable pointing at a mutated copy (for example `MATH_COMPUTATION_MODULE`, `V5_PLUGIN`, `PERSONA_ROOT`, `INSTALLER_JS`), so evidence can be reproduced without editing repository files.
- **Documentation counts are derived and swept**: every `TOTAL <n>` in a live document must equal the value derived by `node tests/run-tests.mjs --counts`; timings must quote each family's **own** `TOTAL WALL TIME` line; **frozen historical release notes are exempt by name** (and that exemption list is itself asserted to be non-empty).

## Changed

- **Mailbox ordering wording**: the v5 plan, the architecture diagram and the guard checklist now state "**build first, acknowledge later**", and the plan spells out the searchable code order (take pending → compose the block → build the round prompt → send → acknowledge only on success).
- **Installer output uses one language and one line per action**: a user-facing log **label** must not be ASCII-only (an English domain word inside a Chinese label is still fine); restore and cleanup are each reported **exactly once**; and "a pre-existing backup is not a failure" is now judged at the **report level** instead of by matching log text.
- **More conservative validation wording**: constraints that are only checked for existence are still described exactly that way — no "simplification" that would change the verdict.

## Fixed

- **v5 mailbox: a failed wake could lose messages** → acknowledgement happens only after a successful send, unacknowledged messages stay queued for the next successful wake, and a round never prepends the same message twice. Guard: `tests/e2e-v5-round2.test.mjs` (a failed wake leaves the message pending) and the shipped family `tests/v5-institute-fixes.mutants.mjs`.
- **v5 round numbering** → the founding prompt carries the real round; a failed start neither consumes a round nor resets an existing count; a rebuild continues the numbering. Guard: `tests/e2e-v5-round2.test.mjs` (the rebuilt prompt reads `轮次 2`) and `tests/v5-institute-fixes.mutants.mjs` (two `spawnMember` families).
- **v5 paper finalisation** → a failed required-artifact write is named once (naming the artifact and the recovery path); the artifact list contains only what landed; re-running is idempotent and does not repeat the warning. Guard: the shipped suite `tests/e2e-v5-round2.test.mjs`.
- **v5 task compare-and-set** → after a stale `expected_revision` is refused the task is unchanged (verified by reading back `revision` / `ownerId` / `status`). Guard: `tests/v5-institute-fixes.mutants.mjs` (the CAS family).
- **v5 member path contract** → a mismatch between the documented root and the root actually used is named, and the note now **reaches `report()` diagnostics** (it used to be queued and never surfaced). Guard: `tests/e2e-v5-round2.test.mjs` and `tests/audit-v5-integrity.mjs`.
- **v4 Lean library index write failures were silent** → one named site, once, with `lib=` / `proved=` and the "stale until the next successful rebuild" consequence, covering every caller and leaving the return value untouched. Guard: the Lean-library-index section of `tests/formal-verify-v4.test.mjs` and the shipped family `tests/formal-verify-v4.mutants.mjs` (its 8th family reddens by name).
- **v4 `.current` marker write failures were silent** → named once, with the consequence that the next session may load the previous project. Guard: the current-project-marker section of `tests/formal-verify-v4.test.mjs` and `tests/formal-verify-v4.mutants.mjs`.
- **Rosters and verification surface** → the published **voter set** is asserted to agree with its `voterCount` and to have distinct ids; the **staff persona** is asserted to actually reach each member's persona and prompts. Guard: `tests/audit-participant-set-parity.mjs`, `tests/audit-persona-surface.test.mjs`.
- **Installer (see "Changed")** → restore and cleanup are each reported exactly once, and "a pre-existing backup is not a failure" is judged at report level. Guard: `tests/audit-installer-policy.test.mjs`, `tests/audit-installer-compat.test.mjs` and the shipped family `tests/audit-installer-assertions.mutants.mjs`.
- **Documentation drift** → all 8 places that still described the old mailbox order were corrected, plus a prose↔code pairing check. Guard: `tests/audit-v5-integrity.mjs`.

## Compatibility & Migration

- **Breaking changes: none.** Parameter defaults, data formats and the directory layout are unchanged across all four presets.
- **Additive only**: the new documentation and verification surface (the field table, the mutant families and self-probes, the copy-targeting audit seams) do not change any runtime contract; any new response field is **additive**.
- **Migration: none needed.**
- The DSH support window is the same as 2.7.2 (see `engines.dsh` in `package.json`).

## Known Limitations

- **This machine has no Lean / LaTeX engine, and none of Octave / Julia / MATLAB / Maple / Wolfram**: those faces were **not exercised locally**; the plugins report them honestly — `configured` lists the engines enabled by configuration, and `absent[]` (each entry carrying `why`) says why this machine does not have them.
- **The two scripted end-to-end live runs (v4 and v5) were bounded by resource limits (token cap / wall clock) and are recorded as non-results rather than passes**: behavioural coverage for **capacity refusal, interrupt, project-switch failure, the installer self-check and `/compact`** therefore rests on the **shipped suites**, while those runs served as placement and observability evidence.
- **Engine versions were not observed**: no supported engine is installed on this machine, so this release cannot report engine version readings.
- **Commercial engine templates** still need confirmation on a licensed machine and remain marked as requiring human confirmation.
- **Release notes before 2.7.0 are Chinese only** (see `README.en.md` for the English history index).

## Verification

- `node tests/run-tests.mjs` — expected `TOTAL 101 PASS 101 FAIL 0` (44 suites + 57 probes/variants).
- Targeted guard entry points: `node tests/audit-v5-integrity.mjs --self-probe` (8/8), `node tests/audit-participant-set-parity.mjs --self-probe` (6/6), `node tests/audit-math-computation-parity.mjs --self-probe` (8/8), `node tests/audit-persona-surface.test.mjs` (276/0).
- The shipped **mutant families** (`tests/*.mutants.mjs`) each require a **named** failure for a single-site mutation; the `--self-probe` modes run a mutated copy and require the named assertion to redden.
- Host: DSH **0.2.0-rc.2**.
- Real engines: **not installed, not executed** (see "Known Limitations"); engine existence is always proven by listing directories or probing, never assumed.

## Dependencies

- **No new runtime dependencies**; the DSH support window is unchanged.
