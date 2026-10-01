# dsh-vibe-math 2.7.0 — Release Notes (English)

> Previous release: 2.6.0. This release adds two capabilities: **incremental Lean formalisation
> (async compilation + `import` reuse)** and the **`math_computation` tool** (one shared
> implementation for all four presets). Existing parameter defaults, data formats and directory
> structure are **unchanged** (the release only adds parameters and directories), the DSH support
> window is unchanged, and no migration is needed.

---

## Overview

- **Incremental Lean formalisation**: `leanAsync` (default `true`) compiles on a per-session
  background queue and returns as soon as the job is queued; new `leanJobsMaxParallel`
  (default `1`), `leanInitiative` (`off|normal|eager`, default `normal`) and `leanSearchPaths`
  (default `[]`). New read-only tools `lean_read` / `lean_job`; jobs are mirrored to
  `Formal/Jobs/<jobId>.json`.
- **`math_computation` (new tool)**: `op:'probe'` pre-checks engines/packages/licences, `op:'run'`
  computes, and every run is archived as a reviewable receipt; `op:'install'` is a two-step
  plan-then-confirm flow and `op:'receipt'` re-checks a receipt read-only.
- **Engines**: `python` / `r` / `octave` / `julia` / `matlab` / `maple` / `wolfram` / `cli`.
  The three commercial ones are **detected and licence-checked only and are never installed**;
  `cli` is on by default (two documented ways to disable it).
- **Archive → edit → re-run**: receipts carry `scriptPath`/`scriptHash`; after editing a script you
  must re-run it with `mode:'file'`, because an old receipt is not evidence for edited code
  (`scriptChanged` / `scriptChangedDuringRun` warn explicitly).
- **Six new parameters**: `mathComputation` / `mathMode` / `mathEngines` / `mathTimeoutMs` /
  `mathPackages` / `mathInstallScope` (the bilingual README table and `docs/math-computation.md`
  are authoritative).
- This release went through **four independent audit rounds** plus a **real-host packaging/boot
  certification on the frozen commit**; the gate is `TOTAL 65  PASS 65  FAIL 0`
  (44 suites + 21 probes).

## Changes

### 1. Incremental Lean formalisation + async compilation + `import` reuse

- **New parameters** (identical in all four presets; every default preserves existing behaviour):
  - `leanAsync`: default `true`. `true` = compile on a **per-session background queue** and return
    as soon as it is queued; `false` = synchronous `await` (the old semantics).
  - `leanJobsMaxParallel`: default `1` (serial). Concurrency cap for background compilations.
  - `leanInitiative`: `off | normal | eager`, default `normal`. **How eager the staff are about
    formalising during normal work.**
  - `leanSearchPaths`: default `[]`. Extra `--search-path` roots; when non-empty they are injected
    **first** and the automatic root is injected **after** them.
- **Queue state machine**: jobs move through explicit states, and **only `settled(ok)` counts as
  passed** - "queued" or "compiling" never counts as proved.
- **`import` reuse**: the compile command automatically injects `--search-path <VibeMath root>`, so
  `import Formal.Lib.<name>` / `Formal.Proved.<name>` work directly (cross-project reuse of archived
  definitions and lemmas).
- **New read-only tools**: `lean_read` (read archive/library content) and `lean_job` (job status).
  Both are **read-only** and never trigger a compilation.
- **Job mirror**: every job keeps a mirror at `Formal/Jobs/<jobId>.json`, so a restart can re-queue
  or explicitly interrupt it.
- **Honest note**: `leanInitiative` and `formalVerify` are **two independent axes**.
  `formalVerify:'off'` disables the **verification stage**; it does not swallow the initiative axis:
  `off + normal` ⇒ no Lean text at all; `off + eager` ⇒ **only** the daily line (the proactivity
  prompt) appears, while the verification stage stays off.

### 2. The new `math_computation` tool

- **Six frozen parameters** (the names cannot change; identical spelling across the four presets,
  the bilingual README table and the contract doc):
  | Parameter | Default | Meaning |
  |---|---|---|
  | `mathComputation` | `auto` | `off` (a true no-op) / `auto` (works once an engine is detected) / `on` |
  | `mathMode` | `typed+shell` | **Prompt policy**: `typed` never mentions the shell and disables `engine:'cli'` |
  | `mathEngines` | `[python,r,octave,julia,matlab,maple,wolfram,cli]` | Allowed set and probe order; removing `cli` closes the escape hatch |
  | `mathTimeoutMs` | `60000` | Per-run budget (minimum 1000); on timeout the process is **actively terminated** |
  | `mathPackages` | `[]` | Packages required by default; a missing one is reported with a plan, **never auto-installed** |
  | `mathInstallScope` | `user` | Install scope; `system` must be passed explicitly every time and is **never remembered** |
- **`op`**: `probe` (engines/versions/packages/licences), `run` (`mode: code|file|expr`),
  `receipt` (read-only re-check), `install` (two-step).
- **Failure codes (11, frozen)**: `MATH_NOT_AVAILABLE`, `MATH_ENGINE_NOT_FOUND`,
  `MATH_ENGINE_LICENSE_REQUIRED`, `MATH_ENGINE_UNUSABLE`, `MATH_MISSING_PACKAGES`, `MATH_TIMEOUT`,
  `MATH_NONZERO_EXIT`, `MATH_ENGINE_BAD_ARGV`, `MATH_REFUSED`, `MATH_INVALID_ARGUMENT`,
  `MATH_NO_SUBPROCESS`; each carries a machine-readable `next` (`user-install` / `agent-install` /
  `vendor` / `enable` / `engine-override` / `reason` / `note`).
- **Deterministic receipts**: `runId` is derived only from preset + project + engine + mode + key +
  sorted packages and contains **no wall clock**; `argv` is echoed **both** in the receipt and in the
  return value (copy it to re-run); full `stdout`/`stderr` land on disk while the return value is
  capped at 64 KB.
- **Engines**: `python`/`r`/`octave`/`julia` are free; `matlab`/`maple`/`wolfram` are **commercial** -
  detected and licence-checked only, **never installed** (vendor guidance only); `cli` runs the
  command you name, still under the tool's timeout, output caps, cwd and receipt.
- **Two installation routes**: ① user self-install (per-OS commands + official links); ② agent
  install via `plan → planToken → confirm` (the token binds the plan content, so a changed plan
  invalidates it). Scope defaults to **user**; `system` must be confirmed **every time**; each
  execution writes an audit file `Computation/installs/<planToken>.json` (exact commands, exit codes,
  before/after versions and **uninstall templates**). Package installation has **no universal
  rollback** - the tool guarantees verifiable commands/versions plus uninstall templates, not
  automatic rollback.
- **`cli` is on by default** (it is no broader than the host shell the model already has, but it adds
  receipts and limits); two documented ways to disable it: `mathMode:'typed'`, or removing `'cli'`
  from `mathEngines` - both return `MATH_REFUSED`.
- **Archive → edit → re-run (integrity rules)**:
  - the return value and the receipt both carry `scriptPath`/`scriptHash`; the script original can be
    opened and edited;
  - re-run it with `mode:'file'` after editing ⇒ a **new receipt** (new attempt, new hash); **an old
    receipt is not evidence for edited code**;
  - `scriptChanged` (the current file differs from the previous receipt) and
    `scriptChangedDuringRun` (the file changed while the run was in flight) **warn explicitly** and
    are recorded in the receipt;
  - archives are **append-only** (`Computation/<id>/`, attempt n≥2 under `attempts/<n>/`) and
    existing files are **never overwritten**;
  - the retention caps (20 attempts / 200 runs) **warn only and never delete**; unknown parameter
    keys in a hand-edited state file are **reported** (`diagnostics`) instead of being dropped
    silently.

### 3. Honest boundaries (please read)

- **Engine execution is verified only through a fake subprocess seam**: no real python/R/octave/julia/
  matlab/maple/wolfram was run on this machine; real-engine verification needs a machine with those
  engines installed (the **static** surface - templates, licence probes, install plans - is pinned by
  guards).
- **The plugin cannot enforce network or write restrictions**: the host's `subprocess.spawn` has
  **no policy slot** (its `env` layer only scrubs credentials/`DSH_*` names and cannot restrict
  network or disk access); real enforcement needs host sandbox support and is **recorded as a pending
  upstream requirement**.
- **Commercial templates are marked `VERIFY`**: the CLI templates for Maple (especially), MATLAB and
  Wolfram change between versions, so their descriptors carry a `VERIFY` flag; every run echoes the
  real argv, and a usage/option error returns `MATH_ENGINE_BAD_ARGV` with a `mathEngineOverride`
  hint instead of a bare `MATH_NONZERO_EXIT`. Machines with licences should verify those three
  templates themselves.
- **SageMath is P2**: this release only has the descriptor placeholder; it is not wired in.
- **The two comparison experiments are given as run-books** (sync vs async compilation; without vs
  with `import` reuse): these notes contain **no fabricated numbers** and do not claim that a
  real-Lean-corpus comparison was completed.

### 4. Review and verification

This release went through **four independent audit rounds** (adversarial re-falsification, cross
audit, user on-ramp, fresh-lens review) and a **real-host packaging/boot certification on the frozen
commit**; the gate is `TOTAL 65  PASS 65  FAIL 0` (**44 suites + 21 probes**), plus 22 module-level
mutation probes that each require a *named* assertion to turn red.

## Compatibility

- Existing parameter defaults, data formats and directory structure are **unchanged**; every new
  parameter defaults to "does not change existing behaviour" (`leanAsync=true` merely moves
  compilation to a background queue, `leanInitiative='normal'` keeps the previous proactivity).
- New directories `Computation/` and `Formal/Jobs/`; the host's text write **creates missing parent
  directories**, so nothing has to be pre-created by hand.
- The DSH support window is unchanged (the `>=0.1.7` patch row and the `<=0.1.6` directory row both
  ship the shared module).

## Upgrade

- Upgrade directly: **no migration** - no parameter was renamed and no state-file format changed.
- To turn the new capabilities off: `mathComputation:'off'` (a true no-op), `leanAsync:false` (back to
  synchronous compilation), `leanInitiative:'off'` (no proactive formalisation).
