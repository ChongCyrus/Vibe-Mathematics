# docs/acceptance — the verification evidence for the vmu work

This directory holds the **evidence** behind the judgements made about the vmu framework: what was claimed, which
reading supports it, on which copy and at which moment it was taken, and what remains unproven. It is evidence, not
design documentation — the design volumes live in [`vibe-math-vmu/docs/`](../../vibe-math-vmu/docs/).

## Where this directory came from, and why it moved

Until round 38 of the work it lived **outside the repository**, at `_handoff/vmu/` under the workspace root. That made
44 rounds of verification work depend on one machine's filesystem: the ledger that judges the goals, the parity matrix,
and every per-round report were all unversioned. **The migration moved them in.** The mapping is mechanical:

| before | after |
| --- | --- |
| `_handoff/vmu/<name>` | `docs/acceptance/<name>` |

## Two facts a reader must not get wrong

**1. The historical self-references inside these reports were deliberately NOT rewritten.** The reports cite each other
and their own probe scripts by their *old* paths (about 114 occurrences of `_handoff/vmu/`). Those citations record
**where a file was when the reading was taken**. Rewriting them would turn a record of history into a claim that the
files were always here. Apply the table above when following an old path.

The one exception is a comment in `tests/audit-claim-traceability.test.mjs`, which keeps the old path **explicitly
labelled as the old path** for the same reason.

**2. These files are version-controlled but are NOT shipped.** They are deliberately absent from
`package.json#files`, so they do not enter the npm tarball. The audit that requires shipped files to list the
`docs/*.md` they cite uses a single-segment pattern (`docs/<name>.md`), so nothing here creates a listing obligation.

## Which audits were checked before moving (the migration was not blind)

| audit | scope it actually reads | affected? |
| --- | --- | --- |
| `scripts/check-docs.mjs` | `vibe-math-vmu/docs/` | no |
| `tests/audit-doc-index.test.mjs` | `vibe-math-vmu/docs/`, `/^\d\d-.*\.md$/` | no |
| `audit-claim-traceability`, `audit-cross-volume-refs`, `audit-doc-planned-claims`, `audit-docs-entry-template`, `audit-module-coverage`, `audit-package-membership`, `audit-planned-names` | all read `vibe-math-vmu/docs/` | no |
| `tests/audit-code-size.test.mjs` | `vibe-math-vmu/**/*.js` only, 1200-line cap | no |
| `scripts/preflight.mjs` (installer item) | `package.json#files` entries prefixed `vibe-math-vmu/` | no |
| **`tests/audit-claim-traceability.test.mjs`** | a **provenance table** naming where a non-code claim id is defined | ★ **yes** |

**The one real consequence.** That test kept an `EXTERNAL` table, documented as *"defined outside the repo"*, and
asserted every entry existed under the **workspace** root. `F53` (an entry number of the v5r inventory) was in it — a
gap recorded in round 6 because the inventory then lived outside the repository. Moving the inventory in would have
made that table assert a fact that is no longer true: *that a file inside the repo exists outside it.* So the table was
**split by root** — `EXTERNAL` (workspace root) and `IN_REPO` (repository root) — and `F53` moved to the second. The id
did not change meaning; its **root** did. Both tables are asserted to be *exactly* the sets they were created for, so
neither can grow into a dumping ground, and a comment records the old path as the old path.

## Bytes are preserved, so the recorded hashes still reproduce

Every file here is **LF-only**, and `.gitattributes` sets `*.md text eol=lf`, so the checkout is byte-identical to what
was written: the `sha256` values quoted in the reports remain recomputable. Headline volumes at the moment of the move
(sha256, first 16 hex):

| volume | sha256[0:16] | bytes |
| --- | --- | --- |
| `03-v5r-full-inventory.md` | `364304efa0bfdd27` | 373110 |
| `04-parity-matrix.md` | `a9a6c5b95a588861` | 366263 |
| `v5r-inventory-b.md` | `eab61db0859e32de` | 151114 |
| `v5r-inventory-c.md` | `5e4441cff4d2bf40` | 117126 |
| `17-objective-status.md` | `4836a0aced96ca61` | 106100 |
| `v5r-inventory-a.md` | `bc221a1995c46198` | 100359 |
| `05-framework-strength-evidence.md` | `095ad5cee5cf50c4` | 71068 |
| `12-goal1-e2e.md` | `d0dc27f885bc4d18` | 41974 |

## How to read this directory

- **`17-objective-status.md`** — the ledger. Judges each goal, separates what is *established* from what is *unproven*,
  and records a change condition for everything held back.
- **`04-parity-matrix.md`** — the goal-by-goal parity matrix, with the discipline family collected as numbered entries.
- **`03-v5r-full-inventory.md`** and **`v5r-inventory-{a,b,c}.md`** — the deep read of v5r this work was judged against.
- **`<family>-roundNN-report.md`** — per-round reports (`core`, `comms`, `pack`, `assistant`, `verify`, `activity`,
  `resume`, `math`). Each one is the reading its author actually took, with the copy, version and moment named.
- **`r37-recompute-r34-truncation.mjs`** — the one executable here: it re-derives a real-machine elision reading from
  retained material, so that claim stays re-computable by someone who was not present when it was made.

## The rule this directory exists to serve

A reading must say **which copy, which version, which moment** it came from — and a claim that cannot be re-derived
from what was kept is one revision away from being unverifiable. Where that could not be achieved, the reports say so
by name instead of leaving the reader to assume otherwise.
