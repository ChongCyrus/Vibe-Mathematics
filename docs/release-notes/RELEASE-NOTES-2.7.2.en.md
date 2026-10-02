# dsh-vibe-math 2.7.2 — Release Notes (English)

> Previous release: 2.7.1. This is a **PATCH release that contains fixes and additive response fields only** — no existing behaviour contract changes. It completes **engine discovery, evidence and diagnostics** on real hosts: an engine that is installed but not on `PATH` is now found, install guidance never hands over a command that cannot run, and failure evidence (timeout, missing packages, unenforced constraints) is neither absent nor silent. The archive identity and the participant-set semantics are directly checkable. Parameter defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- **More reliable discovery on real hosts**: discovery runs PATH → runtimes shipped by the host → **the known per-OS install locations**, so an engine installed in its default directory but never added to `PATH` (R, for example) is found. The engines with known default locations are **R / Octave / Julia / MATLAB** (plus Python on Windows); Maple and Wolfram have no stable default layout and are not covered. A host may also supply the candidate roots through the optional `installRoots` interface, so discovery no longer depends on the plugin process's environment variables.
- **No more unrunnable install commands**: `MATH_ENGINE_NOT_FOUND` only offers an executable command when that package manager really exists on this machine; otherwise it gives the suggested command, the official location and the reason.
- **`probe` no longer reports only the good news**: besides the engines that resolved, it names the **configured but not found** engines and why.
- **Complete failure evidence**: `MATH_TIMEOUT` carries the same fields as `MATH_NONZERO_EXIT`, and a timeout's partial output is available in **both the response and the receipt**.
- **The constraint policy is stated**: version constraints are **checked for existence only and never enforced**, and the constraints that were not checked are listed instead of being dropped silently.
- **Checkable archive identity**: the run response carries the archive id and attempt, and the "edit an archived script, then re-run" semantics are explained by an explicit field and warning.
- **One participant set per verify/meeting (v4/v5)**: the roster is snapshotted with a version, every view reads the same snapshot, and the version increments when the set really changes so a stale set is detectable.
- **More specific diagnostics**: member-level failures return a code, the current state and a next step instead of a bare "no such resident".

## Added

- The `math_computation` `run` response now carries **`runId`** and **`attempt`** (previously the archive id existed only inside the receipt, so a caller could not verify "same archive").
- The `probe` response now carries **`configured`** (every engine enabled in the configuration) and **`absent[]`**, where each missing engine states **`why`** (`not-found-on-this-machine` or `needs-a-caller-supplied-command`).
- Constraint policy fields: both a successful response and a "missing packages" failure carry **`versionPolicy`** and **`constraintsNotEnforced`** (the constraints that were **not** checked, or an empty array).
- `MATH_TIMEOUT` responses carry **`stdout`**/**`stderr`** (capped); the receipt JSON carries **`partialStdout`**/**`partialStderr`**.
- `MATH_ENGINE_NOT_FOUND`'s `next` carries **`suggestedCommand`**, **`packageManager`**, **`packageManagerAvailable`** and **`note`** (plus `vendorUrl` where the engine has one).
- The `run` response carries **`fileIsArchivedScript`**: when `mode:'file'` targets an **archived copy**, it also emits the **`ARCHIVED_SCRIPT_RERUN`** warning explaining that this is a **new archive by design** (new id, attempt 1, no history). To get a **new attempt of the same archive with change detection**, edit the **original source file** and re-run `mode:'file'` pointing at **that same source path**.
- v4: `status()` carries **`rosterVersion`** and **`frozenParticipants`**; the `consensus` / `meeting` / `verify` views carry their own `rosterVersion`.
- v4: the `paper` view carries **`dirProjected`** / **`dirSource`** / **`readSideEffect`**, saying whether the path is a projection or real state.
- v2/v3: decision and sub-agent interrupt diagnostics carry **`code`** and **`next`** (for example `VIBE_MATH_DECISION_NOT_FOUND`, with the current queue state); v4 member-level calls carry **`V4_NO_SUCH_RESIDENT`** with the current roster and a next step.

## Changed

- **Discovery order**: PATH → runtimes shipped by the host → the known per-OS install locations (Windows `%ProgramFiles%`, `%ProgramFiles(x86)%`, `%LOCALAPPDATA%\Programs`; the macOS framework path; Linux `/usr/lib/R`, `/opt/R`, and similar). **Existence is always proven by listing a directory**, never assumed.
- **Install guidance**: `next.command` is an executable command only when the corresponding package manager resolves on this machine; otherwise it is empty and a `note` plus the official location is given. Installation is still plan → `planToken` confirmation → execution, with user scope by default.
- **The archive key**: `mode:'file'` is keyed by the **source path** and `mode:'code'`/`'expr'` by the script content. Editing the **same source file** and re-running therefore lands on the **same archive** (`attempt ≥ 2`, `scriptChanged:true`, `previousReceipt` pointing at the previous attempt, and the earlier attempt is never overwritten). Pointing at a **different path** (a copy of the archived script, say) writes a **new archive**, where `attempt:1`, `scriptChanged:false` and `previousReceipt:null` are **expected**. The archive id contains no random value.
- **v4 roster freeze and prune**: a verify/meeting freezes its participant set and records `rosterVersion`; **removing a member also prunes it from the frozen set** (otherwise in-flight votes could never close), **new members do not join a frozen set**, and `rosterVersion` increments whenever the set really changes. With no verify/meeting in progress, `status().frozenParticipants` is an explicit `null`.
- **v2/v3 single-source vote counting**: the per-round counts come from one function (`voteCount`, reading the **expectation recorded when the verify task was created** plus the round), so the four readers (enough votes, all reported, consensus, final verdict) no longer derive them separately — raising or lowering the verifier count can no longer make the views disagree. **Deliberately unchanged**: the `MIN_REVIEWERS` floor and the "everyone agrees" predicate. That combination — not a simplified predicate over the current round alone — is what decides when a verification may conclude; collapsing the two would let a single reviewer's verdict be accepted too early.
- **Documentation** now states the verification boundary, the known differences and the new response fields, including the engine versions verified on real hosts and the confirmed edge codes.

## Fixed

- **Installed but invisible engines**: scanning only the host process's PATH reported an engine installed in its default directory (measured: R 4.6.1) as missing; it is now discovered from the known install locations and version-probed like any other candidate.
- **Unrunnable install commands**: the tool used to suggest a package manager that does not exist on the machine (for example `winget`); it now only offers the command when the manager resolves, and otherwise gives the official location plus an explanation.
- **Incomplete timeout evidence**: `MATH_TIMEOUT` previously lacked `exit` and `stderr`, and its partial output existed only in the on-disk `stdout.txt`; the response and the receipt now both carry the capped partial output, aligned with `MATH_NONZERO_EXIT`.
- **`probe` listing only what worked**: the availability line could show a few engines without explaining the rest of the configuration; it now names the **configured but not found** engines and why.
- **Version constraints silently ignored**: the response now states that constraints are existence-only and lists every constraint it did **not** check.
- **Confusing "edit an archived script, then re-run"**: an explicit field and warning now distinguish "targeting a copy of an archive ⇒ a new archive with no history" from "targeting the original source ⇒ the same archive with a new attempt", and state that an old receipt is not evidence for edited code.
- **A misleading `paper` field in v4**: with no paper state the field is a **projected path**; it is now flagged via `dirProjected`/`dirSource` and declares that reading `status` has no filesystem side effect.
- **Path basis in member-visible material**: all four presets now state that member file tools resolve against the **session cwd**, that the listed relative paths need the **absolute project-root prefix**, and that computation artifacts should be opened via the absolute `receipt.scriptAbs` or by joining `receipt.cwd` with `receipt.scriptPath`.
- **Member-level calls answering only "not found"**: v4 now returns an error code, the current roster and a next step; v2/v3 decision and interrupt diagnostics likewise return `code` and `next`.

## Compatibility & Migration

- **Breaking changes: none.** Parameter defaults, data formats and the directory layout of all four presets are unchanged.
- **Additive only**: every field added in this release is additional; please ignore unknown fields rather than failing on them.
- **Migration: none needed.**
- The DSH support window is the same as 2.7.1 (see `engines.dsh` in `package.json`).

## Known Limitations

- **Octave / Julia are not shipped** and were not installed on the verification machine; their templates and install plans are statically validated but have not been executed on a real host.
- **Commercial engine templates (MATLAB / Maple / Wolfram)** still need confirmation on a licensed machine and remain marked `VERIFY` by default.
- **Version constraints are existence-only**: version solving still belongs to the package manager; this tool does not parse constraints.
- **The plugin cannot enforce network or write restrictions**: the subprocess channel has no policy slot; that requires a host-side sandbox.
- **Release notes before 2.7.0 are Chinese-only** (see the English history index in `README.en.md`).

## Verification

- `node tests/run-tests.mjs` — all green (65 items: 44 suites + 21 sensitivity probes).
- Three math-contract guards: `tests/audit-math-computation-parity.mjs`, `-contract.mjs`, `-sensitivity.mjs`.
- Real-host verification (python 3.12.10 and R 4.6.1): both engines produce the same numbers for the same computation; the native path and the `cli` escape hatch agree numerically and share the same `scriptHash`; timeout → `MATH_TIMEOUT`, syntax error → `MATH_NONZERO_EXIT` (with stderr and a receipt), missing package → `MATH_MISSING_PACKAGES` (no receipt directory written), an engine warning → a normal exit with stderr preserved.

## Dependencies

- **No new runtime dependencies**; the DSH support window is unchanged.
