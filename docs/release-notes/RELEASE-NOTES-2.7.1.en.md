# dsh-vibe-math 2.7.1 — Release Notes (English)

> Previous release: 2.7.0. This is a PATCH release that ships two batches together. **Batch 1 (honesty and install policy)**: a substitute that changes exactness or conclusion strength must be declared; python installs dispatch to conda/mamba/uv/pip from the **detected environment**; R/Octave/Julia system-scope refusals state the **per-engine reason**; **version solving is delegated to the package manager** while the tool only checks presence. **Batch 2 (seven defects found by the first real end-to-end run)**: the probe now reports the requested engine, engine discovery also finds the runtimes **DSH ships itself**, the `cli` escape hatch prechecks against `cli.command`'s own interpreter, `mode:'code'` really passes the script (caller argv wins when it already runs code), versions are real, probe argv carries no shell metacharacters, and discovery probes no longer depend on the project directory existing. Existing parameter defaults, data formats and directory structure are **unchanged**, the DSH support window is unchanged, and no migration is needed.

---

## Overview

- **Declare substitutions**: a new rule line (zh/en) requires that a substitute changing exactness/conclusion strength be stated explicitly; it lands in **both persona blocks of all four presets**, in the rule block and in the tool description. Missing engines/packages explicitly lead to an **alternative or an install plan**, and installation always goes `plan → planToken → confirm`.
- **Python package-manager dispatch**: `conda` / `mamba` (`-y -c conda-forge`) / `uv` (`uv pip …`) / the **pip fallback** (`-m pip install --user`); detection reads the interpreter's **own environment** (detect, don't guess) and an ambiguous case falls back to pip with the **assumption** recorded in plan/message/audit.
- **System scope now explains itself**: `system` still returns `MATH_REFUSED` + `next.reason:'system-scope-unsupported'`, but the message states **why per engine** (R→`R_LIBS_USER`, Octave→`share/packages`, Julia→`JULIA_DEPOT_PATH`, plus conda/mamba/uv reasons).
- **Version constraints**: `name` / `name[extras]` / `name<op>version` are accepted; anything else is refused with the new reason `unsupported-version-syntax`. **Version solving belongs to the package manager** - the tool probes presence by base name and passes the spec through verbatim.
- A real-host defect was fixed along the way: the install path resolved the interpreter by **engine name** (`python`) instead of the descriptor's candidate order (`python3`→`python`→`py`), which would have broken conda detection on a real machine.

- **Seven real-machine defects fixed** (all found by the first real end-to-end run, all closed on the same bytes): the probe echoed `python` for any requested engine; the bundled DSH runtime was invisible; the `cli` precheck ignored `cli.command`; `mode:'code'` never passed the archived script; `engine.version` was `"unknown"`; probe argv contained `|`/`%` (which a real host answers with a null spawn); and probes ran with a cwd that does not exist on a brand-new workspace (the single root cause behind "found but unusable" and the false "missing package").
- **Two permanent guards added**: §20 the JSON-serialisability invariant over 13 response shapes, and §21 the fresh-root simulation (a spawn whose cwd does not exist answers `exit:null`).

## Changes

### 1. Honesty about substitutions

- **The rule**: when an alternative changes **exactness or conclusion strength** - exact symbolic solution → numerical approximation, closed form → sampling/quadrature, changed precision/tolerances/assumptions, a different algorithm class - the conclusion **MUST say so** and must not read as if the original (exact/requested) result had been obtained; if the exact result is unavailable, say so plainly.
- **Where it lives** (one constant per language): `MATH_SUBSTITUTION_RULE_LINE` / `MATH_SUBSTITUTION_RULE_LINE_EN`, folded into `MATH_RULE_LINES`/`_EN` (so `mathAvailabilityLine()` carries them), with a paraphrased sentence in the tool description; **both persona text blocks of all four presets append them verbatim** (append, never replace an existing rule line).
- **Missing engines/packages**: still report-only, and now explicitly offer an **alternative or an agent install plan**; installation always issues a plan first and requires **`planToken` confirmation** (the token binds the plan content, so a changed plan invalidates it), scope defaults to user, and `system` must be given explicitly every time and is never remembered.

### 2. Python package-manager dispatch

The `python` install plan picks the manager from the **interpreter's own environment** instead of hard-coding pip:

| Detected environment | Commands in the plan | Basis |
|---|---|---|
| the interpreter path carries a conda marker (`/envs/`, `/conda`, `/miniconda*`, `/anaconda*`, `/mambaforge`, `/miniforge`) and `conda` resolves | `conda install -y -c conda-forge <pkg>` (uninstall `conda remove -y <pkg>`) | path marker + resolvability |
| same, but only `mamba` resolves | `mamba install -y -c conda-forge <pkg>` (uninstall `mamba remove -y <pkg>`) | as above |
| `uv` sits **next to** the interpreter (a uv-managed venv) | `uv pip install <pkg>` (uninstall `uv pip uninstall <pkg>`) | same directory only |
| anything else | `python -m pip install --user <pkg>` (uninstall `python -m pip uninstall -y <pkg>`) | **documented fallback**, plan flagged `managerAssumed` |

- **Detect, don't guess**: the plan, the returned message and the audit JSON all carry `manager` / `managerAssumed` / `managerWhy`; an ambiguous case falls back to pip and says "the plan assumes pip".
- **Install and uninstall stay paired**: the uninstall command comes from the same chosen manager (the audit carries the uninstall template; there is still **no universal automatic rollback**).
- **A real defect fixed on the way**: the install path used to resolve the interpreter by **engine name** (`python`) rather than the descriptor's **candidate order** (`python3`→`python`→`py`) - on a real host the conda `python3` *is* that interpreter, so dispatch would not have seen the environment markers. It now resolves exactly like the run path.

### 3. Per-engine system-scope policy

- R / Octave / Julia are **user-scope only**; `scope:'system'` returns `MATH_REFUSED` + `next.reason:'system-scope-unsupported'`, and the message gives the **engine-specific reason**:
  - **R**: the user library is `R_LIBS_USER`; a system install would write into the distribution's package tree (root or the distro package manager).
  - **Octave**: `pkg install` writes to the user package directory; system-wide would write Octave's `share/packages` (root).
  - **Julia**: `Pkg.add` installs into the active environment / user depot (`JULIA_DEPOT_PATH`); "system scope" is not a Julia concept.
- **conda / mamba / uv** likewise have no system template and each carries its own reason; **python on pip keeps a real system template** (without `--user`), confirmed explicitly on every call.

### 4. Version-constraint policy

- **Accepted**: `name`, `name[extras]`, `name<op>version` where `<op>` ∈ `==` `>=` `<=` `~=` `!=` `>` `<` `=` (pip-style `numpy==1.2`, conda-style `numpy=1.2`).
- **Refused**: spaces, `;`, `|`, `&`, `$`, backticks, `@`, parentheses - anything shell-unsafe or unknown to the manager ⇒ `MATH_INVALID_ARGUMENT` + `next.reason:'unsupported-version-syntax'` (a suspicious string is **never** handed to a shell).
- **Division of labour**: **version solving belongs to the package manager** - the tool probes and reports missing packages by **base name**, passes the spec through **verbatim** in the install plan, and states this in the plan as `versionPolicy`.
- **Vocabulary**: `unsupported-version-syntax` is the new machine-readable reason; the vocabulary is now **13 reasons / 7 `next.kind` values / 11 failure codes**, kept in **set-equality** across `tool-schema.json#refusalVocabulary`, `docs/math-computation.md` §3 and the parity guard (which also requires every `reason:` value to be a string literal).

### 5. Seven real-machine defects (one root cause, three symptoms)

1. **`op:'probe'` ignored the requested engine.** The response carried `engine: null` (or the first *allowed* engine), and the failure path always blamed `params.mathEngines[0]` (python), so `probe{engine:'r'}` echoed python and told the user to install python. It now resolves the **requested** engine and reports its name/path/version; a requested engine that resolves (including `cli`) counts as available, and a missing requested engine is reported — and guided — as *that* engine.
2. **Engine discovery missed the runtimes DSH ships itself.** PATH is still tried first; when nothing resolves and the host declares the optional `runtimeRoots` + `listDirAbs` fields, the tool finally scans `<root>/dsh-runtimes/*/dependencies/<engine>/` — the **tree name is globbed** (never a hard-coded `dsh-primary-runtime`) and only the descriptor's own candidate names are accepted. A found engine now reports its **real version** and **no install guidance is emitted** (a winget hint for an engine that is already installed is exactly what misled the user).
3. **The `cli` package precheck ignored `cli.command`.** The generic `cli` descriptor has no package probe, so every package looked missing and the escape hatch blocked itself. The precheck now runs for the **family** of the resolved command (`python*`/`Rscript`/`octave`/`julia`), against that very interpreter; an unrecognisable family **skips** the precheck with an explicit warning instead of reporting a false "missing".
4. **`mode:'code'` never passed the script.** `cli` received only the command, so python dropped into a REPL (`exit=0`, empty stdout — which reads as success). For `mode:'code'`/`'file'` the archived script path is now appended to argv; **when the caller's argv already provides a program slot (`-c`/`-m`/`-e`/`--eval`/`--command`), the caller's argv wins** and nothing is appended (otherwise the script would be fed as an extra argument). The receipt records `cli.scriptAppended` and, when skipped, `cli.scriptSkipped` with the reason.
5. **`engine.version` was `"unknown"`.** For `cli` the version is now obtained with the family descriptor's real version probe (unknown families remain `"unknown"`).
6. **Probe argv contained shell metacharacters.** A real host answers argv containing `|` (and `%`) with a **null spawn**. All probe codes were rewritten to be metacharacter-free (one line per package: `name ok|missing`) and the parser accepts both the old `name:state` and the new `name state` shapes; python still passes **one argv item per package**.
7. **The root cause: probe cwd did not exist on a brand-new workspace.** Version probes, the package precheck and the licence probe spawned with `projectRoot()` as cwd — but on a fresh session that directory does not exist yet, and the host answers such a spawn with `spawned: true, exit: null` (retries cannot help: same cwd, same result). That single cause produced "found but unusable", the false "missing package", and `version: "unknown"`. Probes now use a cwd that is guaranteed to exist (`probeCwd`: optional host field → OS temp dir → project root); real runs keep the project root, which they create by writing the receipt first.

### 6. Two new permanent guards

- **§20 JSON-serialisability invariant.** The probe diagnostics had a self-referential `retryDiag`, so `JSON.stringify(response)` threw `Converting circular structure to JSON` and the caller saw **no result at all**. Diagnostics are now projected to plain fields (`jsonSafeDiag`), and the shared suite asserts that **13 response shapes** (`probe`/`run`/`receipt`/`install`, success and failure, including the retried-failure `retryDiag` case) serialise.
- **§21 fresh-root simulation.** The fake seam models the host ("a spawn whose cwd does not exist answers `exit:null`", and `writeText` marks the directory as created), asserting that a probe on a fresh root is still `ok:true` with a real version, that no probe reports `exit:null`, and that the precheck still runs.

### 7. Review and verification

- **Same discipline**: the four shared-module copies are **byte-identical** (`install-copies --check` ⇒ `COPIES OK`); `math-computation-shared` **278/0**, the four preset suites **114/116/153/117**, `audit-math-computation-contract` **155/0**, `audit-math-computation-parity` **92/0**, `audit-math-computation-sensitivity` **22 probes / 0 problems**, the mutation proofs **16 proved / 0 problems** (each turning a named assertion red); the gate is `TOTAL 65  PASS 65  FAIL 0` (**44 suites + 21 probes**).
- **Real-session evidence (fresh empty workspace, first tool call)**: `probe{engine:'python'}` ⇒ `ok:true`, `version 3.12.14`, path `…/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe`, no `exit:null`; `run` via `cli` with the bundled interpreter and `packages:['numpy']` ⇒ `exit:0`, `stdout:"1.643935 -2.0"` (Σ1/k² for k=1..1000 and det([[1,2],[3,4]])), `packages.found.numpy:"present"`, `warnings:[]`, six receipt files.
- **Honest boundaries that still stand**: engine execution is now verified **via the `cli` escape hatch on the DSH-bundled runtime** (that is the only real-engine path proven here — the built-in engines are still covered only through the fake subprocess seam); `session/follow` token-level deltas, multi-client use and mid-turn `cancel` remain **unverified**; the host's `subprocess.spawn` has **no policy slot**, so the plugin cannot enforce network/write restrictions (that needs host sandbox support); the Maple/MATLAB/Wolfram templates are marked `VERIFY` with `mathEngineOverride` available; **SageMath is P2**; the two comparison experiments are **run-books** and these notes contain **no fabricated numbers**.

## Compatibility

- Existing parameter defaults, data formats and directory structure are **unchanged**; this release only adds rule text, install-plan dispatch and one machine-readable reason - **no migration**.
- **The only behaviour change is inside install plans**: machines without conda/uv markers still use pip (as before); **a conda/mamba/uv environment now gets that manager's commands** (which is the point of this release), and the uninstall command comes from the same manager.
- The `system`-scope return code and `next.reason` are **unchanged** (only the message carries more information); the python+pip system template is still there.

## Upgrade

- Upgrade directly; no migration.
- To keep install plans on **pip** always: run on an interpreter without conda/uv markers (or point at the system python). The tool never "guesses" a manager - it only dispatches when the interpreter's own environment says so.
