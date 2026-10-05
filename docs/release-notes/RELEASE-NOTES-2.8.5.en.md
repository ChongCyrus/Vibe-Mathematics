# dsh-vibe-math 2.8.5 — Release Notes

> Previous release: 2.8.4. This is a **patch release** (the version stays on the 2.8.x line): it is mostly **fixes** — the Lean formalization path could not compile by default, TeX engines that are installed but not on PATH are now found, plus several corrections to the member-facing prompts; it also carries one **purely additive** capability (the feedback library, on by default and changing no existing behaviour). Parameter names and defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- **The Lean formalization path works again**: the injected search-root flag was spelled for Lean 3, so the compiler failed at **argument parsing** (the file was never read) and formalization could never pass; the presets now inject `-R <root>`, and on a real host a minimal proof compiles, is archived, and can be read and reused by another member.
- **TeX engines that are installed but not on PATH are now found**: new **bounded**, documented candidate roots (still documented locations only, no full-disk scan, never an automatic install, never a write outside the workspace); when nothing is detected, `triedPaths` still **names** every path that was probed.
- **The prompts no longer demand things a member cannot do**: a missing engine is now reported to the office (or the group chat) instead of "asking the user"; the LaTeX guidance states **when it applies**; the "receipt" concept is given background; the empty engine table no longer contradicts itself; the member-facing notice frame is now **【研究所提示】**; and agent-facing text no longer contains drive-letter literals.
- **New cooperation / management / work-experience feedback library** (v5): record how the institute works and close the loop — the `self`/`team` routes are **self-adjustment with no approval**, while the `interpersonal` route requires an assessment and a **written-back verification** afterwards; switch `feedback` (default `on`).
- **The two install/upgrade traps are now documented**: `dsh plugin …` needs a working **`pnpm`**, and install/upgrade should **pin an explicit version** (a bare name can stay on an OLD version).
- Maintainer-facing: a set of static invariants and named-mutation self-checks across all four presets; the gate is **decoupled** from whether the host has TeX installed, so the suites give the same result on any machine.

## Added

- Tool **`vibe_v5_feedback`** (v5, member-usable): `op` is `'add' | 'update' | 'list' | 'summary'`; `list` defaults to the **not-yet-closed** entries (filter by `category`/`route`; `all: true` shows everything); `summary` counts by category and route.
- Carrier: `Shared/Feedback/<category>.md` (`cooperation`｜`management`｜`process`｜`obstacle`｜`conflict`) plus a `Shared/Feedback/index.json` index; the authoritative data lives in the institute's **durable state**, so a restart does not lose it.
- Parameter **`feedback`** (v5): `'on'` (default) | `'off'`. With `'off'` the prompt section is **not injected** and **every** operation of the tool is **refused by name** (`V5_FEEDBACK_DISABLED`) — never a silent write.
- **Three routes** (stated in the prompt and the docs): `self` = your own way of working ⇒ **adjust it yourself, nobody has to adopt it**; `team` = organisation / workflow / how the team runs ⇒ **no approval either**, change it as soon as it looks wrong; `interpersonal` = **caused by someone else and only they can fix it** ⇒ the **only** route that requires an assessment first and a **written-back verification** afterwards (`outcome` must be filled in before it can close).
- Permissions: members and temp workers may `add`, and may `update` only the entries **they started**; the office may `update` any entry (mark it resolved / write the result back).
- Observability: entry count / not-yet-closed count / per-category / per-route counts appear in `vibe_v5_feedback {op:'summary'}`, `vibe_v5_report` and `vibe_v5_overview`.

## Changed

- Prompts (the four affected presets): handling a missing engine changed from "ask the user" to "**report what happened to the office** (or the group chat)", and the office confirms with the user — members have no channel to the user.
- Prompts: the LaTeX guidance now says it **only applies while you are writing or compiling the paper**, instead of appearing as unexplained noise in every wake.
- Prompts: in `math_computation`'s "archive → edit → re-run" section, the **first** mention of a receipt now explains "**a receipt = the JSON result of one `math_computation` call** — run `probe` or `run` once and its fields are right there", with minimal glosses on the key fields.
- Prompts: the empty engine table changed from `math_computation：本机可用 （无）` to **`math_computation：可用引擎 无`** (English `available engines none`).
- Prompts: the member-facing notice frame changed from `【框架提示】` to **`【研究所提示】`**.
- Documentation: the install section and its troubleshooting note state the `pnpm` prerequisite and the "explicit version" rule; the README's old "upgrade with `@latest`" wording is corrected to an explicit version.
- Maintainer-facing: the shipped prompt corpus was regenerated together with the text above.

## Fixed

- **Symptom**: Lean formalization almost never passed in v2/v3/v4/v5 — the log showed many Lean invocations while `formal.passed` stayed empty. **Cause**: the injected search-root flag was Lean 3's `--search-path`, while Lean 4 only accepts `-R` / `--root`, so the compiler exited with `rc=1` at **argument parsing** and the file was never read. **Fix**: all four presets inject `-R <root>`; if the user already set a search root in `leanArgs`, no second one is injected (semantics unchanged). **Verified**: on a real host the compiler is invoked correctly and reads the file; the minimal proof `theorem probe_true : True := trivial` compiles and is archived into `Verified/Lean/`, after which **another member reads that archived lemma and uses its statement as the premise of a new theorem** (reuse works). Guards: `tests/formal-verify-v2.test.mjs` / `tests/formal-verify-v3.test.mjs` / `tests/formal-verify-v4.test.mjs` / `tests/formal-verify-v5.test.mjs`, `tests/audit-prompt-invariants.mjs` (flag spelling plus "no preset text may teach `--search-path` again"), `tests/v5-institute-fixes.mutants.mjs` (named reds).
- **Symptom**: when TeX Live was installed at a location such as `texlive\<year>\bin\windows` (installed but not on PATH), all four presets reported "no LaTeX engine detected" and delivered tex+md only. **Cause**: the default probe covered PATH and MiKTeX's common roots only. **Fix**: new **bounded** candidate roots (Windows `texlive\<year>\bin\windows` under a drive root, `/usr/local/texlive` and `/opt/texlive` on Unix-like systems, `/Library/TeX/texbin` on macOS) with a **cap** on the total; still **documented locations only, no full-disk scan, never an automatic install, never a write outside the workspace**; when nothing is detected, `triedPaths` still **names** every path that was probed. **Verified**: on a real host an engine that is installed but not on PATH is found (the PATH lookup fails, a documented root hits); with those roots sandboxed, every candidate probe stays inside the allowed tree and the total stays under the cap. Guards: `tests/audit-prompt-invariants.mjs` (documented-root coverage / the cap / no bare drive root / every probe site must go through the sandboxable seam), `tests/e2e-v5-round2.test.mjs`, `tests/audit-math-computation-parity.mjs`.
- **Symptom**: members were asked to do something they cannot do ("ask the user"). **Fix**: changed to "report what happened to the office (or the group chat)". Guards: `tests/audit-prompt-invariants.mjs` (member-visible text may not demand an impossible action), `tests/e2e-v5-round2.test.mjs`.
- **Symptom**: agent-facing text contained host absolute paths (drive-letter literals), which are wrong guidance on another machine. **Fix**: rewritten portably (`texlive\<year>\bin\windows`, `/usr/local/texlive`, `/opt/texlive`, `/Library/TeX/texbin`). Guards: `tests/audit-prompt-invariants.mjs` (source-level drive-letter criterion plus the path criterion over the four prompt corpora), `tests/audit-path-discipline.mjs`.
- **Symptom**: the first time a member saw "the receipt fields `scriptPath` / `scriptAbs`" it had no idea what a receipt was and probed around for it. **Fix**: the "archive → edit → re-run" section now gives that background at its **first** mention. Guards: `tests/e2e-v5-round2.test.mjs` (module-level behaviour plus the member prompt end to end), `tests/v5-institute-fixes.mutants.mjs` (removing that sentence reddens by name).
- **Symptom**: with no engine, the prompt rendered `math_computation：本机可用 （无）`, which contradicts itself. **Fix**: it now reads "可用引擎 无" (English `available engines none`). Guards: `tests/e2e-v5-round2.test.mjs`, `tests/v5-institute-fixes.mutants.mjs` (restoring the old wording reddens by name).
- **Symptom**: member-facing text called the plugin "框架", which is ambiguous from an agent's point of view (the plugin? the host? the institute?). **Fix**: the notice frame is now **【研究所提示】**. Guards: `tests/e2e-v5-round2.test.mjs` (source level: `【框架提示】` no longer appears in agent-facing text), `tests/v5-institute-fixes.mutants.mjs`.

## Compatibility & Migration

- Breaking changes: **none**.
- Additive only: the `vibe_v5_feedback` tool, the `feedback` parameter (default `'on'`), and the `Shared/Feedback/` directory with its index.
- Migration: **none needed**; existing parameter names and defaults, data formats and the directory layout are unchanged.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).
- **Upgrade**:

```
dsh plugin --profile <your profile> add dsh-vibe-math@2.8.5
```

  - If you are still on an **OLD version** after upgrading: first check that `pnpm` works — the plugin management behind `dsh plugin …` needs a working `pnpm`; without it the install fails, and the **plugin market may show no reason** (attach `~/.dsh/profiles/<profile>/hub.log` to locate it).
  - Then check whether that profile's `package.json` / `pnpm-lock.yaml` still points at the old version: they **win** over the `latest` tag, so **a bare name can stay on an OLD version**; retry with an explicit version.

## Known Limitations

- The LaTeX engine probe still covers **documented locations only**: an engine in a non-standard directory will not be discovered; use the `paperLatexCommand` parameter to name the engine command by absolute path (the prompt tells you to probe again after setting it).
- The few behaviours that need a real engine/host can only be confirmed by a **real-host re-test**; the shipped suites protect them with **source-level invariants plus a sandboxable seam**, and do not claim to cover host-level behaviour (for example "the caller is dropped after an interrupt").
- **The feedback library produces no research evidence**: it records methodology and collaboration only (how work is organised, where it is stuck, friction between people); research conclusions still go to `Progress/` and `Verified/`.
- Install/upgrade: on this machine's toolchain `@latest`, `@^2`, `pnpm update --latest` and `pnpm add …@latest` all failed to guarantee an upgrade, so an **explicit version** is still recommended (see "Upgrade").
- A root-agent question blocks the whole institute (operational note, product unchanged): state the problem and the acceptance criteria up front for long runs.

## Verification

- `node tests/run-tests.mjs` — all green (**106** items: 44 suites + 62 probes).
- `node scripts/release-check.mjs` — exits 0; after publishing, add `--registry` to compare the registry shasum with the local tarball.
- This release's suites: `node tests/e2e-v5-round2.test.mjs` (measured `passed=484 failed=0`), `node tests/v5-institute-fixes.mutants.mjs` (**33/33** named reds), `node tests/audit-prompt-invariants.mjs` (**211/0**; `--self-probe` **26/26**), `node tests/audit-artifact-docs.mjs` (**24/0**; its mutant harness **8/8**), `node tests/audit-math-computation-parity.mjs` (**108/0**).
- Real-host re-check recipe: ① **Lean** — on a host with Lean installed, send one object through `vibe_v5_lean_archive` (`kind:'proof'`); it should compile, the file should appear under `Verified/Lean/`, and another member should be able to `import` it; ② **TeX** — install the engine into a documented root but keep it off PATH; the paper flow should no longer report "no engine detected", and `triedPaths` should list the paths that were probed.

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
