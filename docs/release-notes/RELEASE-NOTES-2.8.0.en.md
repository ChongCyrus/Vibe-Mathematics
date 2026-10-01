# dsh-vibe-math 2.8.0 — Release Notes (English)

> Previous release: 2.7.0. This release closes the **honesty gap around installation and substitutions**: a substitute that changes exactness or conclusion strength must be declared; python installs dispatch to conda/mamba/uv/pip based on the **detected environment**; R/Octave/Julia system-scope refusals state the **per-engine reason**; and **version solving is delegated to the package manager** while the tool only checks presence. Existing parameter defaults, data formats and directory structure are **unchanged**, the DSH support window is unchanged, and no migration is needed.

---

## Overview

- **Declare substitutions**: a new rule line (zh/en) requires that a substitute changing exactness/conclusion strength be stated explicitly; it lands in **both persona blocks of all four presets**, in the rule block and in the tool description. Missing engines/packages explicitly lead to an **alternative or an install plan**, and installation always goes `plan → planToken → confirm`.
- **Python package-manager dispatch**: `conda` / `mamba` (`-y -c conda-forge`) / `uv` (`uv pip …`) / the **pip fallback** (`-m pip install --user`); detection reads the interpreter's **own environment** (detect, don't guess) and an ambiguous case falls back to pip with the **assumption** recorded in plan/message/audit.
- **System scope now explains itself**: `system` still returns `MATH_REFUSED` + `next.reason:'system-scope-unsupported'`, but the message states **why per engine** (R→`R_LIBS_USER`, Octave→`share/packages`, Julia→`JULIA_DEPOT_PATH`, plus conda/mamba/uv reasons).
- **Version constraints**: `name` / `name[extras]` / `name<op>version` are accepted; anything else is refused with the new reason `unsupported-version-syntax`. **Version solving belongs to the package manager** - the tool probes presence by base name and passes the spec through verbatim.
- A real-host defect was fixed along the way: the install path resolved the interpreter by **engine name** (`python`) instead of the descriptor's candidate order (`python3`→`python`→`py`), which would have broken conda detection on a real machine.

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

### 5. Review and verification

- **Same discipline**: the four shared-module copies are **byte-identical** (`install-copies --check` ⇒ `COPIES OK`); `audit-math-computation-contract` **151/0**, `audit-math-computation-parity` **92/0**, `math-computation-shared` **200/0**, the four preset suites **113/115/152/116**, `formal-verify-v2` **471/0**, `-v3` **383/0**, `audit-math-computation-sensitivity` **22 probes / 0 problems**, this round's mutants **5 proved / 0 problems**; the gate is `TOTAL 65  PASS 65  FAIL 0` (**44 suites + 21 probes**).
- **Honest boundaries that still stand**: engine execution is verified **only through the fake subprocess seam** (no real engine was run on this machine); the host's `subprocess.spawn` has **no policy slot**, so the plugin cannot enforce network/write restrictions (that needs host sandbox support); the Maple/MATLAB/Wolfram templates are marked `VERIFY` with `mathEngineOverride` available; **SageMath is P2**; the two comparison experiments are **run-books** and these notes contain **no fabricated numbers**.

## Compatibility

- Existing parameter defaults, data formats and directory structure are **unchanged**; this release only adds rule text, install-plan dispatch and one machine-readable reason - **no migration**.
- **The only behaviour change is inside install plans**: machines without conda/uv markers still use pip (as before); **a conda/mamba/uv environment now gets that manager's commands** (which is the point of this release), and the uninstall command comes from the same manager.
- The `system`-scope return code and `next.reason` are **unchanged** (only the message carries more information); the python+pip system template is still there.

## Upgrade

- Upgrade directly; no migration.
- To keep install plans on **pip** always: run on an interpreter without conda/uv markers (or point at the system python). The tool never "guesses" a manager - it only dispatches when the interpreter's own environment says so.
