# Generator CLI convention (TB-2698)

> **Deliverable**: one implementation — `scripts/_lib/generator-cli.mjs` — deciding what a generator does with its
> arguments, and a behaviour test — `tests/generator-cli-convention.test.mjs` — that proves no generator writes while
> looking read-only. Written by `env-lane`; the tree was never regenerated here (`--write` belongs to the Lead).

## 1. Why this exists (the accident, dated)

On 2026-11-10 a verification pass ran `node scripts/generate-coverage-debt.mjs` and `node scripts/update-doc-counts.mjs`
and **six generated documents changed**. Both scripts wrote without `--write` (`generate-coverage-debt.mjs` had only a
`--check` branch, the write at the end was unconditional; `update-doc-counts.mjs` said "rewrite in place" and treated
`--check` as the exception), while six sibling generators refused to write without `--write`. Two opposite defaults for
one class of tool is not a documentation gap: **a command that looks read-only must not change what it measures**, and a
convention that depends on remembering a flag is the drift shape this repository keeps finding.

## 2. The contract

| invocation | meaning | writes | exit |
|---|---|---|---|
| *(no flag)* | READ: report what would change | never | 0 |
| `--check` | CHECK: the same report, as a failure | never | 0 in sync, 1 when stale |
| `--write` | WRITE: rewrite the generated artefact | yes | 0 (1 only if the generator reports a finding) |
| `--write --check`, or an undeclared flag | REFUSE, named on stderr | never | 2 |

`--dry` / `--dry-run` are READ aliases. A bare run prints **the same staleness text** as `--check` (plus a
`(dry run: nothing written)` suffix) so callers that pin the message keep working.

## 3. Implementation

`scripts/_lib/generator-cli.mjs` exports `parseMode(argv, {script, allow})` (pure: returns `{mode, extras, args}` or
throws a named `CliRefusal`), `modeFrom(argv, opts)` (same, but prints two lines and exits 2 on refusal),
`isWriteMode(mode)` and `exitCodeFor(mode, stale)`. `allow` names extra switches (`--json`, `--selftest`) that are not
modes; `--flag=` marks a flag that takes a value. The child of a chain is always given its flag **explicitly**
(`regen-all.mjs` passes `--check`, or `--write` only in write mode; `generate-wiring-index.mjs` probes its two
sub-generators with `--check`), so no parent relies on a child's default.

## 4. Covered generators (the whole document-writing family)

`update-doc-counts` · `generate-coverage-debt` · `generate-rule-matrix` · `generate-kernel-index` ·
`generate-surface-index` · `generate-readiness-figures` · `generate-wiring-index` · `generate-vmu-settings-table` ·
`generate-planned-settings` · `generate-planned-codes` · `generate-glossary-table` ·
`generate-zero-mechanism-matrix` · `generate-pack-prompts` · `generate-pack-persona` · `generate-wired-schema`.
`generate-seam-table.mjs` keeps its own input-flag contract: it writes to `os.tmpdir()` unless `--out` says otherwise,
so it is not a document writer. `scripts/dev/**` is out of scope.

## 5. Proof, not a source scan

`node tests/generator-cli-convention.test.mjs` clones the work tree to `os.tmpdir()/gencli-<pid>/` (no `.git`), snapshots
every file's `mtimeMs:size` plus a full sha256, runs the generators, and requires the snapshot to be byte-identical.
Three anti-lamps keep the detector honest: **1** reverting the write guard to always-on makes the same detector call the
bare run DIRTY and name the `.md`; **2** a second `--write` changes no byte; **3** after `--write`, every `--check`
exits 0, and one added kernel module (or one added test job) turns the corresponding `--check` red, naming it — while
the same staleness under no flag stays a report with exit 0. Every mutation happens in a throw-away clone removed in
`finally`; running the test leaves no mark on the real tree.

## 6. How to verify

`node tests/generator-cli-convention.test.mjs` (85 passed, 0 failed) · `node scripts/regen-all.mjs --check` (the closing
gate; `--write` is the Lead's step) · `node scripts/generate-coverage-debt.mjs --check` (one tool, both sides).
