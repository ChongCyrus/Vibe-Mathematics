# proof portability (TB-2695, task-178)

The release gate runs every `fixed` row of `docs/acceptance/sim-audit-open-items.json` as its own
`proof:{cmd,expect}`. A row is only closed if that command can run on a machine that has the repository
and Node and nothing else: no audit corpus left behind by an earlier run, no red-team harness outside the
checkout, no `D:/_tmp` that happens to exist. This file classifies every proof by what it needs.

## The three states

| State | Meaning | Test |
| --- | --- | --- |
| `REPO-SELF-CONTAINED` | The command builds every fixture it measures from repository bytes, writes only under a temp directory it creates itself (`os.tmpdir()` or an env-overridable root), and reads no artifact produced by another command. | Passes with `VMU_*` unset and no pre-existing corpus. |
| `NEEDS-CORPUS-GENERATED-IN-REPO` | The command itself (or a command in its own chain) produces the corpus first, using only repository code; nothing is fetched or restored from outside. | Green on a clean machine, but costs the generation step. |
| `OUT-OF-REPO` | The command needs a path or artifact that the repository does not create: a hard-coded host directory, receipts from a real run, a harness outside the checkout, or a network dependency. | Fails, or silently measures nothing, on a machine without that artifact. |

A proof that needs a corpus is not automatically `OUT-OF-REPO`: if the proof can generate that corpus with
repository code, it is `NEEDS-CORPUS-GENERATED-IN-REPO` and the ledger note should say so. `OUT-OF-REPO`
is reserved for the ones a clean machine cannot satisfy at all.

## The 26 proofs in the ledger (2026-11-10)

The task book expected 28 rows; the ledger now carries 26 `fixed` rows with a proof. Three further items
(`run254-leftopen-4-c10-lean-archive` and `parity-declaration-keys`, both `accepted`, and
`audit13-p0-1-proofs-need-out-of-repo-evidence`, `open`) carry no proof and are out of scope here.

| # | Row | Sev | Proof command | State |
| --- | --- | --- | --- | --- |
| 1 | `run254-leftopen-1-notice-comment` | P1 | `node tests/vmu-run248-notice-delivery.test.mjs` | `REPO-SELF-CONTAINED` |
| 2 | `run254-leftopen-2-shape-passthrough` | P0 | `node tests/vmu-run256-delivery-code-passthrough.test.mjs` | `REPO-SELF-CONTAINED` |
| 3 | `run254-leftopen-3-skipped-aggregation` | P1 | `node tests/vmu-run260-skipped-totals.test.mjs` | `REPO-SELF-CONTAINED` |
| 4 | `tb2616-parked-turn` | P0 | `node tests/vmu-run256-parked-turn.test.mjs` | `REPO-SELF-CONTAINED` |
| 5 | `tb2617-records-one-face` | P0 | `node tests/vmu-run256-records-one-face.test.mjs` | `REPO-SELF-CONTAINED` |
| 6 | `tb2634-deterministic-consult-id` | P1 | `node tests/vmu-run257-deterministic-ids.test.mjs` | `REPO-SELF-CONTAINED` |
| 7 | `worktree-audited` | P0 | `node tests/release-ready.test.mjs` | `REPO-SELF-CONTAINED` |
| 8 | `harvest-coverage-debt-2026-11-09` | P1 | `node scripts/sim/audit/all.mjs` | `NEEDS-CORPUS-GENERATED-IN-REPO` |
| 9 | `audit14-p0-1-pack-declaration-ledger` | P0 | `node tests/vmu-run258-pack-declaration-gate.test.mjs` | `REPO-SELF-CONTAINED` |
| 10 | `audit14-p0-2-release-gate-forgeable` | P0 | `node tests/release-ready.test.mjs` | `REPO-SELF-CONTAINED` |
| 11 | `audit14-p0-3-reindex-noop-loop` | P0 | `node tests/vmu-run259-audit14.test.mjs` | `REPO-SELF-CONTAINED` |
| 12 | `audit14-p1-1-delivery-timeout-retried` | P1 | `node tests/vmu-run256-delivery-code-passthrough.test.mjs` | `REPO-SELF-CONTAINED` |
| 13 | `audit14-p1-2-clock-values-not-validated` | P1 | `node tests/vmu-run259-audit14.test.mjs` | `REPO-SELF-CONTAINED` |
| 14 | `audit14-p1-3-records-identity-tautology` | P1 | `node tests/vmu-run259-records-identity-order.test.mjs` | `REPO-SELF-CONTAINED` |
| 15 | `audit14-p1-4-records-order-nan` | P1 | `node tests/vmu-run259-records-identity-order.test.mjs` | `REPO-SELF-CONTAINED` |
| 16 | `audit14-p1-5-orphan-needs-idle-loop` | P1 | `node tests/vmu-run257-abandon-orphan.test.mjs` | `REPO-SELF-CONTAINED` |
| 17 | `audit14-p1-6-clearedparked-two-meanings` | P1 | `node tests/vmu-run257-abandon-orphan.test.mjs` | `REPO-SELF-CONTAINED` |
| 18 | `audit14-p1-7-hints-name-nonexistent-things` | P1 | `node tests/vmu-run257-refusal-hints.test.mjs` | `REPO-SELF-CONTAINED` |
| 19 | `audit14-p1-8-meeting-not-started-advice-dead` | P1 | `node tests/vmu-run257-refusal-hints.test.mjs` | `REPO-SELF-CONTAINED` |
| 20 | `audit14-p1-9-fs-first-evidence-thin` | P1 | `node tests/vmu-run255-md-ownership.test.mjs` | `REPO-SELF-CONTAINED` |
| 21 | `audit14-o1-repo-hygiene` | P2 | `node tests/repo-hygiene.test.mjs` | `REPO-SELF-CONTAINED` |
| 22 | `audit14-o34-suite-hygiene` | P2 | `node tests/vmu-run257-prompt-receipt-parity.test.mjs` | `NEEDS-CORPUS-GENERATED-IN-REPO` |
| 23 | `audit14-p1-10-fidelity-baseline-stale` | P1 | `node scripts/sim/audit/all.mjs` | `NEEDS-CORPUS-GENERATED-IN-REPO` |
| 24 | `audit14-p2-1-stale-declaration-keys` | P2 | `node scripts/sim/audit/all.mjs` | `NEEDS-CORPUS-GENERATED-IN-REPO` |
| 25 | `RULES-E33-SOURCE-GREP` | P2 | `node tests/vmu-meeting-types.test.mjs` | `REPO-SELF-CONTAINED` |
| 26 | `RULES-E26-ROTATION-ASSERTION` | P2 | `node tests/vmu-meeting-types.test.mjs` | `REPO-SELF-CONTAINED` |

Result: `REPO-SELF-CONTAINED` 22, `NEEDS-CORPUS-GENERATED-IN-REPO` 4, `OUT-OF-REPO` **0**.

The last three `OUT-OF-REPO` rows were closed by TB-2695 (task-178) with a two-line change, not by
deleting the rows:

- `tests/vmu-run248-notice-delivery.test.mjs` — now `TMP_ROOT = process.env.VMU_TEST_TMP_ROOT ||
  (existsSync('D:/_tmp') ? 'D:/_tmp' : tmpdir())`, the same fallback as `tests/repo-hygiene.test.mjs:23`.
  `D:/_tmp` stays the fast local disk on a dev box, but a clean machine gets `os.tmpdir()` instead of a throw.
- `tests/vmu-meeting-types.test.mjs` — identical fallback; it carries the two P2 rows (`RULES-E33`,
  `RULES-E26`).

Measured on a machine with no `D:/_tmp` presumption (see "How to re-measure"): both suites pass with
`VMU_*` unset. The `OUT-OF-REPO` state is kept in this table as a category — a future proof that starts
depending on a host path must be listed there, not silently relaxed.

## The three rows changed by TB-2695

The commands stay as they are; only the notes were wrong, because they described a world where the suite
read a corpus outside the checkout.

| Row | Suggested `proof.note` |
| --- | --- |
| `worktree-audited` | `the gate refuses a report that predates a worktree edit; its fixture tree is built in a temp directory, so the proof no longer needs an audit left behind by another run.` |
| `audit14-p0-2-release-gate-forgeable` | `permanent fixtures for A11/A12/A13/A13b/A14/A15/A16/A16b, plus the duplicateDigestIn(messages) half-vector assertion; the red-team section runs the in-repo runner, and when its fixture roster is absent it records MEASURED-ELSEWHERE in facts instead of reading green.` |
| `audit14-o34-suite-hygiene` | `the parity suite generates its own 47-pair corpus into a temp directory keyed by HEAD and the three generator sources, and fails by name when the corpus is missing instead of skipping.` |

## How to re-measure this table

```
# every proof is runnable in place; a row that cannot run on a clean machine is OUT-OF-REPO
node -e "const l=require('./docs/acceptance/sim-audit-open-items.json');for(const i of l.items){if(i.proof)console.log(i.id+' | '+i.proof.cmd)}"

# the strict reading of "clean machine": no VMU_* hints and no leftovers
env -u VMU_SIM_ROOT -u VMU_REAL_WS_ROOT -u VMU_REAL_OUT -u VMU_SESSIONS_ROOT \
  node tests/release-ready.test.mjs
env -u VMU_PROMPT_RECEIPT_CORPUS node tests/vmu-run257-prompt-receipt-parity.test.mjs
node tests/redteam-gate.test.mjs
node tests/audit-no-silent-reads.test.mjs
node tests/audit-portability.mjs
```

The two suites that used to hard-code `D:/_tmp` now take `VMU_TEST_TMP_ROOT` as an explicit override and fall back
to `os.tmpdir()` when `D:/_tmp` is absent (`VMU_TEST_TMP_ROOT=$(node -e "console.log(require('node:os').tmpdir())")`
exercises the non-`D:/_tmp` root on a machine that has it).

`VMU_TEST_TMP_ROOT` is a **test hook, not a product setting**: it exists only so a proof suite can be pointed at a
different temp root on a machine that happens to have `D:/_tmp`, and its default (unset) behaviour is the portable
one. It is deliberately **not** listed in `vibe-math-vmu/docs/03-interface-contract.md`: the `check-docs` D14 gate
reads that document as the registry of product error codes / settings, and a test-only knob must not be registered
as a product surface.

A proof that cannot be run on such a machine is not evidence for that machine; it is evidence for the
machine that happened to hold the artifact.
